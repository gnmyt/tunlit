const { requestInfo, classifyHost, proxyRequest, proxyUpgrade, QUERY_PARAM } = require("../lib/proxy");
const { SERVICE_WORKER_SOURCE, SW_PATH, injectedScript } = require("../lib/browser");
const { evaluate, isRestricted, tokenFromRequest: accessToken, basicCredentials, cookieFor } = require("../lib/access");
const { verifyPassword } = require("../utils/password");
const { checkAccountCredentials } = require("./auth");
const { sendJson } = require("../utils/html");
const { sendAppState, isNavigation } = require("../utils/pages");
const { sendFile, sendIndex } = require("../utils/static");
const { createApp } = require("../utils/router");
const { authenticate, requireAdmin } = require("../middlewares/auth");
const { NAME_REGEX } = require("../utils/ids");
const logger = require("../utils/logger");

const UI_PREFIX = "/@tunlit";
const API_PREFIX = "/@tunlit/api";
const SELECT_PAGE = "/@tunlit/select";

const wantsHtml = req => /\btext\/html\b/.test(req.headers.accept || "");

const ACME_PREFIX = "/.well-known/acme-challenge/";

const FLAGS = ["tor", "vpn", "datacenter", "blocklisted"];

const createRouter = ({ config, auth, registry, traffic, access, stats, devices, sessions, attempts, certificates, domains, quotas, frames, intel, control }) => {
    const announce = (tunnel, entry) => {
        if (!tunnel.session || tunnel.session.closed) return;
        const { request, response, ...rest } = entry;
        const details = intel.lookup(entry.ip);
        tunnel.session.sendControl({ type: "request", ...rest, country: details.country, org: details.org, flags: FLAGS.filter(flag => details[flag]) });
    };
    const record = (tunnel, entry) => {
        entry.intel = intel.lookup(entry.ip);
        traffic.record(tunnel.id, entry);
        stats.recordRequest(tunnel.id);
    };
    const onRequest = tunnel => entry => {
        announce(tunnel, entry);
        record(tunnel, entry);
    };
    const websocket = tunnel => ({
        open: (entry, writers) => {
            record(tunnel, entry);
            frames.opened(entry.connection, writers);
        },
        frame: (connection, direction, opcode, payload) => frames.record(tunnel.id, connection, direction, opcode, payload),
        close: (connection, entry) => {
            frames.closed(connection);
            traffic.finish(connection, entry.duration).catch(() => null);
            announce(tunnel, entry);
        },
    });
    const api = createApp();
    api.use(API_PREFIX, require("../routes/service"));
    api.use(`${API_PREFIX}/setup`, require("../routes/setup"));
    api.use(`${API_PREFIX}/auth`, require("../routes/auth"));
    api.use(`${API_PREFIX}/tunnels`, authenticate, require("../routes/tunnels"));
    api.use(`${API_PREFIX}/persistent`, authenticate, require("../routes/persistent"));
    api.use(`${API_PREFIX}/quotas`, authenticate, require("../routes/quotas"));
    api.use(`${API_PREFIX}/settings`, authenticate, require("../routes/settings"));
    api.use(`${API_PREFIX}/devices`, authenticate, require("../routes/devices"));
    api.use(`${API_PREFIX}/accounts`, authenticate, requireAdmin, require("../routes/accounts"));
    api.use(`${API_PREFIX}/tls`, authenticate, requireAdmin, require("../routes/tls"));
    api.use(`${API_PREFIX}/oidc`, authenticate, requireAdmin, require("../routes/oidc"));

    const notFound = (req, res, id) => sendAppState(req, res, 404, { kind: "missing", id });
    const offline = (req, res, id) => sendAppState(req, res, 502, { kind: "offline", id });

    const accepts = (policy, credentials) => policy.auth === "password"
        ? verifyPassword(credentials.password, policy.passwordHash)
        : checkAccountCredentials(credentials);

    const denial = async (req, res, info, tunnel) => {
        const policy = tunnel.policy;
        if (!isRestricted(policy)) return null;

        const reason = evaluate(policy, info.clientIp, intel.lookup(info.clientIp));
        if (reason) {
            return { deny: () => sendAppState(req, res, 403, { kind: "blocked", id: tunnel.id, ip: info.clientIp, reason }) };
        }
        if (policy.auth === "none") return null;
        if (access.allows(accessToken(req), tunnel.id)) return null;

        const key = `gate:${tunnel.id}:${info.clientIp}`;
        const credentials = attempts.blocked(key) ? null : basicCredentials(req);
        if (credentials && await accepts(policy, credentials)) {
            attempts.forget(key);
            return { cookie: cookieFor(access.create(tunnel.id), info.secure) };
        }
        if (credentials) {
            attempts.record(key);
            logger.warn(`Failed gate attempt for ${tunnel.id}`, { ip: info.clientIp });
        }

        const headers = isNavigation(req) ? {} : { "WWW-Authenticate": `Basic realm="${tunnel.id}", charset="UTF-8"` };
        return { deny: () => sendAppState(req, res, 401, { kind: "gate", id: tunnel.id, auth: policy.auth }, headers) };
    };

    const tunnelFor = (id, modes) => {
        const tunnel = registry.get(id);
        if (!tunnel || !modes.includes(tunnel.mode)) return { error: "not-found" };
        if (!tunnel.online) return { error: "offline", tunnel };
        return { tunnel };
    };

    const noTunnel = (req, res, location = SELECT_PAGE) => {
        if (!wantsHtml(req)) return sendJson(res, 404, { error: "no_tunnel_selected" });
        res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
        res.end();
    };

    const handleUi = async (req, res, info, pathname) => {
        if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
            const handled = await api.handle(req, res, pathname, { config, auth, registry, traffic, access, stats, devices, sessions, attempts, certificates, domains, quotas, frames, onRequest, info });
            if (!handled) sendJson(res, 404, { error: "not_found" });
            return;
        }
        if (!["GET", "HEAD"].includes(req.method)) return sendJson(res, 405, { error: "method_not_allowed" });
        const relative = pathname === UI_PREFIX ? "" : pathname.slice(UI_PREFIX.length + 1);
        if (relative && !relative.includes("..") && sendFile(req, res, relative)) return;
        sendIndex(req, res);
    };

    const pathTunnel = id => {
        if (!NAME_REGEX.test(id)) return null;
        const tunnel = registry.get(id);
        return tunnel && tunnel.mode === "path" ? tunnel : null;
    };

    const serveSelected = async (req, res, info, id) => {
        const tunnel = pathTunnel(id);
        if (!tunnel) return notFound(req, res, id);
        if (!tunnel.online) return offline(req, res, id);
        const gate = await denial(req, res, info, tunnel);
        if (gate?.deny) return gate.deny();
        return proxyRequest(req, res, tunnel, info,
            { pathMode: true, inject: injectedScript(id), onRequest: onRequest(tunnel), setCookie: gate?.cookie });
    };

    const hostFor = hostname => {
        const host = classifyHost(hostname, config.baseDomain);
        if (host.kind !== "unknown") return host;
        const name = domains.tunnelFor(hostname);
        return name ? { kind: "custom", id: name } : host;
    };

    const hostTunnel = host => tunnelFor(host.id, host.kind === "custom" ? ["subdomain", "path"] : ["subdomain"]);

    const acmeChallenge = (req, res, pathname) => {
        const response = certificates?.challengeResponse(pathname.slice(ACME_PREFIX.length));
        if (!response) return false;
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": Buffer.byteLength(response) });
        res.end(req.method === "HEAD" ? undefined : response);
        return true;
    };

    const handleRedirect = (req, res) => {
        const url = new URL(req.url, "http://tunlit.invalid");
        if (url.pathname.startsWith(ACME_PREFIX) && acmeChallenge(req, res, url.pathname)) return;

        const host = String(req.headers.host || config.baseDomain).replace(/:\d+$/, "").toLowerCase();
        if (!certificates?.covers() && !certificates?.secureContextFor(host)) return handleRequest(req, res);

        const port = config.httpsPort === 443 ? "" : `:${config.httpsPort}`;
        res.writeHead(308, { Location: `https://${host}${port}${req.url}`, "Cache-Control": "no-store" });
        res.end();
    };

    const handleRequest = async (req, res) => {
        const info = requestInfo(req, config);
        const url = new URL(req.url, "http://tunlit.invalid");
        const pathname = url.pathname;

        if (pathname.startsWith(ACME_PREFIX) && acmeChallenge(req, res, pathname)) return;
        const isUi = pathname === UI_PREFIX || pathname.startsWith(`${UI_PREFIX}/`);

        if (!config.ready || config.setupRequired) {
            if (isUi) return handleUi(req, res, info, pathname);
            return noTunnel(req, res, `${UI_PREFIX}/`);
        }

        const host = hostFor(info.hostname);

        if (isUi && host.kind !== "custom") {
            if (pathname === SW_PATH) {
                if (!["GET", "HEAD"].includes(req.method)) return sendJson(res, 405, { error: "method_not_allowed" });
                res.writeHead(200, {
                    "Content-Type": "text/javascript; charset=utf-8",
                    "Service-Worker-Allowed": "/",
                    "Cache-Control": "no-cache",
                    "Content-Length": Buffer.byteLength(SERVICE_WORKER_SOURCE),
                });
                return res.end(req.method === "HEAD" ? undefined : SERVICE_WORKER_SOURCE);
            }
            return handleUi(req, res, info, pathname);
        }

        if (host.kind === "subdomain" || host.kind === "custom") {
            const { tunnel, error } = hostTunnel(host);
            if (error === "not-found" && host.kind !== "custom") return notFound(req, res, host.id);
            if (error) return offline(req, res, host.id);
            const gate = await denial(req, res, info, tunnel);
            if (gate?.deny) return gate.deny();
            return proxyRequest(req, res, tunnel, info,
                { pathMode: false, inject: null, onRequest: onRequest(tunnel), setCookie: gate?.cookie });
        }

        if (host.kind !== "base") return noTunnel(req, res, SELECT_PAGE);

        const selection = /^\/@([^/]+)(\/.*)?$/.exec(pathname);
        if (selection) {
            const id = selection[1].toLowerCase();
            if (!pathTunnel(id)) return notFound(req, res, id);
            return sendAppState(req, res, 200, { kind: "attach", id, to: `${selection[2] || "/"}${url.search}` });
        }
        if (url.searchParams.has(QUERY_PARAM)) {
            return serveSelected(req, res, info, String(url.searchParams.get(QUERY_PARAM)).toLowerCase());
        }

        return noTunnel(req, res);
    };

    const handleUpgrade = (req, socket, head) => {
        const info = requestInfo(req, config);
        const pathname = new URL(req.url, "http://tunlit.invalid").pathname;
        const reject = (status, text) => {
            socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
            socket.destroy();
        };

        if (!config.ready || config.setupRequired) return reject(503, "Setup required");
        const host = hostFor(info.hostname);

        if (host.kind === "base" && pathname === "/@tunlit/ws") return control.handleUpgrade(req, socket, head);

        let target;
        if (host.kind === "subdomain" || host.kind === "custom") target = hostTunnel(host);
        else if (host.kind === "base") {
            if (pathname.startsWith("/@")) return reject(404, "Not Found");
            const selected = new URL(req.url, "http://tunlit.invalid").searchParams.get(QUERY_PARAM);
            if (!selected) return reject(404, "No tunnel selected");
            target = tunnelFor(String(selected).toLowerCase(), ["path"]);
        } else return reject(404, "Not Found");

        if (target.error === "not-found" && host.kind !== "custom") return reject(404, "Tunnel not found");
        if (target.error) return reject(502, "Tunnel offline");
        if (isRestricted(target.tunnel.policy)) {
            if (evaluate(target.tunnel.policy, info.clientIp, intel.lookup(info.clientIp))) return reject(403, "Forbidden");
            if (target.tunnel.policy.auth !== "none" && !access.allows(accessToken(req), target.tunnel.id)) {
                return reject(401, "Unauthorized");
            }
        }
        proxyUpgrade(req, socket, head, target.tunnel, info, { pathMode: host.kind === "base", ws: websocket(target.tunnel) });
    };

    return {
        handleRedirect,
        handleRequest: (req, res) => {
            Promise.resolve()
                .then(() => handleRequest(req, res))
                .catch(err => {
                    logger.error(`request failed: ${err.stack || err}`);
                    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Internal error");
                });
        },
        handleUpgrade: (req, socket, head) => {
            try {
                handleUpgrade(req, socket, head);
            } catch (err) {
                logger.error(`upgrade failed: ${err.stack || err}`);
                socket.destroy();
            }
        },
    };
};

module.exports = { createRouter };
