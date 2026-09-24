const { WebSocketServer } = require("ws");
const { MuxSession } = require("../lib/MuxSession");
const { attachJoiner } = require("./relay");
const { randomToken } = require("../utils/ids");
const logger = require("../utils/logger");
const { summarizePolicy } = require("../lib/access");
const invites = require("../lib/invites");
const packageJson = require("../../package.json");

const PROTOCOL_VERSION = 1;
const HANDSHAKE_TIMEOUT = 15_000;

const createControlServer = ({ config, auth, registry, connections, intel, visitors }) => {
    const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 1024 * 1024 });

    const fail = (session, code, message, wsCode = 4000) => {
        session.sendControl({ type: "error", code, message });
        session.close(wsCode, code);
    };

    wss.on("connection", (ws, req) => {
        const forwarded = config.trustProxy && req.headers["x-forwarded-for"]
            ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
            : null;
        const session = new MuxSession(ws, { parity: 0, name: `cli ${req.socket.remoteAddress}` });
        session.client = { id: randomToken(12), ip: forwarded || req.socket.remoteAddress || "", connectedAt: Date.now() };
        const headerToken = auth.bearerFromHeaders(req.headers);
        let state = "hello";
        let role = null;

        const timer = setTimeout(() => { if (state !== "ready") fail(session, "bad_request", "handshake timeout"); }, HANDSHAKE_TIMEOUT);
        session.once("close", () => clearTimeout(timer));

        let queue = Promise.resolve();
        const handle = async message => {
            try {
                if (message.type === "bye") {
                    session.saidBye = true;
                    session.close(1000, "bye");
                    return;
                }
                if (state === "hello") {
                    if (message.type !== "hello") return fail(session, "bad_request", "expected hello");
                    if (message.version !== PROTOCOL_VERSION) return fail(session, "unsupported_version", `unsupported protocol version ${message.version}`);
                    role = message.role === "joiner" ? "joiner" : message.role === "owner" ? "owner" : null;
                    if (!role) return fail(session, "bad_request", "role must be owner or joiner");
                    if (role === "owner") {
                        const device = await auth.deviceFor(headerToken || message.token);
                        if (!device) return fail(session, "unauthorized", "invalid token", 4401);
                        session.account = await auth.accountFor(device);
                        if (!session.account) return fail(session, "unauthorized", "the account behind this device is gone", 4401);
                        session.credential = device.credential;
                        if (device.guest) {
                            session.guest = device.guest.label;
                            await invites.used(device.guest);
                        }
                    }
                    session.sendControl({ type: "hello", version: PROTOCOL_VERSION, server: `tunlit/${packageJson.version}`, baseDomain: config.baseDomain });
                    state = "setup";
                    return;
                }
                if (state === "setup") {
                    if (role === "owner") {
                        if (message.type !== "register") return fail(session, "bad_request", "expected register");
                        const { tunnel, resumed } = await registry.register(session, message);
                        state = "ready";
                        session.sendControl({
                            type: "registered",
                            id: tunnel.id,
                            mode: tunnel.mode,
                            url: registry.publicUrl(tunnel),
                            customUrls: registry.customUrls(tunnel),
                            persistent: tunnel.persistent,
                            access: summarizePolicy(tunnel.policy),
                            shareCode: tunnel.shareCode,
                            connectUrl: registry.connectUrl(tunnel),
                            resumeToken: tunnel.resumeToken,
                            resumed,
                        });
                        return;
                    }
                    if (message.type !== "join") return fail(session, "bad_request", "expected join");
                    const tunnel = registry.join(session, message.code);
                    state = "ready";
                    attachJoiner(tunnel, session, { connections, intel, visitors });
                    session.sendControl({ type: "joined", id: tunnel.id, port: tunnel.target.port, online: tunnel.online });
                    logger.info(`Joiner attached to ${tunnel.id}`, { from: req.socket.remoteAddress });
                }
            } catch (err) {
                fail(session, err.code || "bad_request", err.message);
            }
        };

        session.on("control", message => {
            queue = queue.then(() => handle(message)).catch(err => logger.error(`control failed: ${err.stack || err}`));
        });

        session.on("stream", stream => {
            if (role !== "joiner" || state !== "ready") stream.destroy(new Error("unexpected stream"));
        });
    });

    return {
        handleUpgrade: (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req)),
        close: () => wss.close(),
    };
};

module.exports = { createControlServer };
