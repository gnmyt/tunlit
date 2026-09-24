const { endSession } = require("../lib/registry");
const { replayRequest } = require("../lib/proxy");
const { serialize } = require("../lib/breakpoints");
const { buildPolicy, describePolicy, summarizePolicy } = require("../lib/access");

const announceAccess = tunnel => {
    if (tunnel.session && !tunnel.session.closed) tunnel.session.sendControl({ type: "access", access: summarizePolicy(tunnel.policy) });
};
module.exports.announceAccess = announceAccess;
const persistent = require("../lib/persistent");

const serializeTunnel = (registry, tunnel) => ({
    id: tunnel.id,
    mode: tunnel.mode,
    target: tunnel.target.authority,
    url: registry.publicUrl(tunnel),
    customUrls: registry.customUrls(tunnel),
    persistent: tunnel.persistent,
    shareCode: tunnel.shareCode,
    online: tunnel.online,
    graceUntil: tunnel.graceUntil,
    joiners: tunnel.joiners.size,
    createdAt: tunnel.createdAt,
    owner: tunnel.owner,
    guest: tunnel.guest,
    access: describePolicy(tunnel.policy),
});

const mayTouch = (tunnel, viewer) => !!tunnel && (viewer.role === "admin" || tunnel.accountId === viewer.account.id);

const serializeClients = tunnel => [...tunnel.joiners].map(session => ({
    id: session.client?.id || "",
    ip: session.client?.ip || "",
    connectedAt: session.client?.connectedAt || null,
    streams: session.streams ? session.streams.size : 0,
})).sort((a, b) => (a.connectedAt || 0) - (b.connectedAt || 0));

module.exports.mayTouch = mayTouch;

module.exports.getTunnel = async (registry, traffic, id, viewer) => {
    const tunnel = registry.get(id);
    if (!mayTouch(tunnel, viewer)) return null;
    const base = { ...serializeTunnel(registry, tunnel), requests: await traffic.count(id) };
    return tunnel.mode === "tcp" ? { ...base, clients: serializeClients(tunnel) } : base;
};

module.exports.listTunnels = (registry, viewer) =>
    [...registry.tunnels.values()]
        .filter(tunnel => mayTouch(tunnel, viewer))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(tunnel => serializeTunnel(registry, tunnel));

const tcpTunnel = (registry, id, viewer) => {
    const tunnel = registry.get(id);
    if (!mayTouch(tunnel, viewer)) return { code: 404, message: "Tunnel not found" };
    if (tunnel.mode !== "tcp") return { code: 400, message: "Only tcp tunnels have clients" };
    return { tunnel };
};

module.exports.disconnectClient = (registry, id, clientId, viewer) => {
    const { tunnel, code, message } = tcpTunnel(registry, id, viewer);
    if (code) return { code, message };
    const session = [...tunnel.joiners].find(joiner => joiner.client?.id === clientId);
    if (!session) return { code: 404, message: "Client not connected" };
    endSession(session, "disconnected by the administrator");
    tunnel.joiners.delete(session);
    return { message: "Client disconnected" };
};

module.exports.disconnectAllClients = (registry, id, viewer) => {
    const { tunnel, code, message } = tcpTunnel(registry, id, viewer);
    if (code) return { code, message };
    const count = tunnel.joiners.size;
    for (const session of tunnel.joiners) endSession(session, "disconnected by the administrator");
    tunnel.joiners.clear();
    return { message: `Disconnected ${count} ${count === 1 ? "client" : "clients"}` };
};

module.exports.updateAccess = async (registry, access, id, input, viewer) => {
    const tunnel = registry.get(id);
    if (!mayTouch(tunnel, viewer)) return { code: 404, message: "Tunnel not found" };
    try {
        tunnel.policy = buildPolicy({ ...input, password: input.password || undefined }, tunnel.policy);
    } catch (err) {
        return { code: err.code === "bad_request" ? 400 : 500, message: err.message };
    }

    access.forget(id);
    if (tunnel.persistent) await persistent.savePolicy(tunnel.id, tunnel.policy);
    announceAccess(tunnel);
    return { message: "Access updated", access: describePolicy(tunnel.policy) };
};

const METHOD = /^[A-Z]{3,10}$/;

const editedPart = (stored, input) => {
    const part = { ...stored };
    if (input.headers !== undefined) {
        if (!Array.isArray(input.headers) || input.headers.some(pair => !Array.isArray(pair) || pair.length !== 2)) {
            throw new Error("Headers must be a list of [name, value] pairs");
        }
        part.headers = input.headers.map(([name, value]) => [String(name).trim(), String(value).trim()]).filter(([name]) => name);
    }
    if (input.body !== undefined) {
        const body = Buffer.from(String(input.body), "utf8");
        part.body = body.length ? body.toString("base64") : null;
        part.bytes = body.length;
        part.truncated = false;
    }
    return part;
};

const edited = (stored, input) => {
    const out = { ...stored, request: editedPart(stored.request, input) };
    if (input.method !== undefined) {
        const method = String(input.method).trim().toUpperCase();
        if (!METHOD.test(method)) throw new Error("Invalid method");
        out.method = method;
    }
    if (input.path !== undefined) {
        const path = String(input.path).trim();
        if (!path.startsWith("/")) throw new Error("The path must start with /");
        out.path = path;
    }
    return out;
};

const editedResponse = (stored, input) => {
    const out = editedPart(stored, input);
    if (input.status !== undefined) {
        const status = Number(input.status);
        if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error("Invalid status");
        out.status = status;
    }
    return out;
};

const bufferOf = part => (part.body ? Buffer.from(part.body, "base64") : Buffer.alloc(0));

module.exports.replay = async (req, id, requestId, input) => {
    const tunnel = req.registry.get(id);
    if (!mayTouch(tunnel, req.session)) return { code: 404, message: "Tunnel not found" };
    if (!tunnel.online) return { code: 502, message: "The tunnel is offline" };
    const stored = await req.traffic.get(id, requestId);
    if (!stored) return { code: 404, message: "That request is no longer stored" };
    if (stored.kind === "ws") return { code: 400, message: "WebSocket connections cannot be replayed" };
    let request;
    try {
        request = edited(stored, input);
    } catch (err) {
        return { code: 400, message: err.message };
    }
    if (request.request.truncated) return { code: 400, message: "The request body was too large to store" };
    const status = await replayRequest(tunnel, request, req.onRequest(tunnel));
    return { message: `Replayed, ${status}`, status };
};

module.exports.getBreakpoints = (req, id) => {
    if (!mayTouch(req.registry.get(id), req.session)) return { code: 404, message: "Tunnel not found" };
    return { rules: req.breakpoints.rulesFor(id), held: req.breakpoints.list(id), now: Date.now() };
};

module.exports.setBreakpoints = (req, id, input) => {
    if (!mayTouch(req.registry.get(id), req.session)) return { code: 404, message: "Tunnel not found" };
    try {
        return { message: "Breakpoints updated", rules: req.breakpoints.setRules(id, input.rules) };
    } catch (err) {
        return { code: 400, message: err.message };
    }
};

module.exports.resolveBreakpoint = (req, id, holdId, input) => {
    if (!mayTouch(req.registry.get(id), req.session)) return { code: 404, message: "Tunnel not found" };
    const held = req.breakpoints.get(id, holdId);
    if (!held) return { code: 404, message: "That request is no longer waiting" };
    if (input.action === "drop") {
        req.breakpoints.settle(holdId, { action: "drop" });
        return { message: "Dropped" };
    }
    const stored = serialize(held);
    try {
        if (held.phase === "response") {
            const response = editedResponse(stored.response, input);
            req.breakpoints.settle(holdId, { action: "continue", status: response.status, headers: response.headers, body: bufferOf(response) });
        } else {
            const request = edited(stored, input);
            req.breakpoints.settle(holdId, { action: "continue", method: request.method, path: request.path, headers: request.request.headers, body: bufferOf(request.request) });
        }
    } catch (err) {
        return { code: 400, message: err.message };
    }
    return { message: "Continued" };
};

module.exports.closeTunnel = (registry, id, viewer) => {
    if (!mayTouch(registry.get(id), viewer)) return { code: 404, message: "Tunnel not found" };
    registry.remove(id, "closed from the web UI");
    return { message: "Tunnel closed" };
};
