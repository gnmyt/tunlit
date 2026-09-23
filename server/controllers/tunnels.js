const { endSession } = require("../lib/registry");
const { replayRequest } = require("../lib/proxy");
const { buildPolicy, describePolicy } = require("../lib/access");
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
    if (tunnel.mode !== "tcp" && input.auth === undefined && input.password === undefined && input.allowedIps === undefined) {
        return { code: 400, message: "Nothing to change" };
    }
    try {
        tunnel.policy = buildPolicy({ ...input, password: input.password || undefined }, tunnel.policy);
    } catch (err) {
        return { code: err.code === "bad_request" ? 400 : 500, message: err.message };
    }

    access.forget(id);
    if (tunnel.persistent) await persistent.savePolicy(tunnel.id, tunnel.policy);
    return { message: "Access updated", access: describePolicy(tunnel.policy) };
};

module.exports.replay = async (req, id, requestId) => {
    const tunnel = req.registry.get(id);
    if (!mayTouch(tunnel, req.session)) return { code: 404, message: "Tunnel not found" };
    if (!tunnel.online) return { code: 502, message: "The tunnel is offline" };
    const stored = await req.traffic.get(id, requestId);
    if (!stored) return { code: 404, message: "That request is no longer stored" };
    if (stored.kind === "ws") return { code: 400, message: "WebSocket connections cannot be replayed" };
    if (stored.request.truncated) return { code: 400, message: "The request body was too large to store" };
    const status = await replayRequest(tunnel, stored, req.onRequest(tunnel));
    return { message: `Replayed, ${status}`, status };
};

module.exports.closeTunnel = (registry, id, viewer) => {
    if (!mayTouch(registry.get(id), viewer)) return { code: 404, message: "Tunnel not found" };
    registry.remove(id, "closed from the web UI");
    return { message: "Tunnel closed" };
};
