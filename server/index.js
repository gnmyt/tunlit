const http = require("node:http");
const https = require("node:https");
const { loadConfig, applyStored } = require("./utils/config");
const { createAuth } = require("./utils/auth");
const { Registry } = require("./lib/registry");
const { TrafficLog } = require("./lib/traffic");
const { Stats } = require("./lib/stats");
const { AccessStore } = require("./lib/access");
const { DeviceStore } = require("./lib/devices");
const { SessionStore } = require("./lib/sessions");
const { AttemptLimiter } = require("./utils/attempts");
const { CertificateManager } = require("./lib/tls/manager");
const { DomainManager } = require("./lib/domains");
const { Quotas } = require("./lib/quotas");
const { FrameLog } = require("./lib/wsframes");
const { isSetupRequired } = require("./controllers/setup");
const db = require("./utils/database");
const { runMigrations } = require("./utils/migrationRunner");
const { dataDir } = require("./utils/paths");
const { hasBuild } = require("./utils/static");
const { createControlServer } = require("./controllers/control");
const { createRouter } = require("./controllers/http");
const logger = require("./utils/logger");
const packageJson = require("../package.json");

let config;
try {
    config = loadConfig();
} catch (err) {
    logger.error(err.message);
    process.exit(1);
}

const devices = new DeviceStore();
const auth = createAuth(devices);
const certificates = new CertificateManager(config);
const domains = new DomainManager({ config, certificates });
const quotas = new Quotas();
const registry = new Registry(config, domains, quotas);
const traffic = new TrafficLog();
const frames = new FrameLog();
const access = new AccessStore();
const stats = new Stats(registry, quotas);
quotas.on("exceeded", accountId => registry.closeFor(accountId, "monthly traffic limit reached"));
registry.on("forget", tunnel => {
    traffic.forget(tunnel.id).catch(err => logger.warn(`Could not drop stored requests: ${err.message}`));
    access.forget(tunnel.id);
    stats.forget(tunnel.id);
});
const sessions = new SessionStore();
const attempts = new AttemptLimiter();
const control = createControlServer({ config, auth, registry });
const router = createRouter({ config, auth, registry, traffic, access, stats, devices, sessions, attempts, certificates, domains, quotas, frames, control });

const SERVER_OPTIONS = { keepAliveTimeout: 65_000, requestTimeout: 0, headersTimeout: 60_000 };

const onClientError = (err, socket) => {
    if (err.code === "ECONNRESET" || !socket.writable) return socket.destroy();
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
};

const onListenError = (name, port) => err => {
    if (err.code === "EADDRINUSE") logger.error(`${config.listen}:${port} is already in use, stop whatever is listening there first`);
    else if (err.code === "EACCES") logger.error(`Not allowed to listen on ${config.listen}:${port}. Ports below 1024 need CAP_NET_BIND_SERVICE`);
    else logger.error(`${name} server error: ${err.stack || err}`);
    process.exit(1);
};

const attach = (server, port, name) => {
    server.on("upgrade", router.handleUpgrade);
    server.on("clientError", onClientError);
    server.on("error", onListenError(name, port));
    return server;
};

const servers = [];

const buildServers = () => {
    if (!config.managesTls) {
        const server = attach(http.createServer(SERVER_OPTIONS, router.handleRequest), config.port, "http");
        servers.push({ server, port: config.port, name: "http" });
        return;
    }

    const secure = https.createServer({
        ...SERVER_OPTIONS,
        SNICallback: (servername, callback) => {
            const context = certificates.secureContextFor(servername);
            if (!context) return callback(new Error("tunlit has no certificate yet"));
            callback(null, context);
        },
    }, router.handleRequest);
    servers.push({ server: attach(secure, config.httpsPort, "https"), port: config.httpsPort, name: "https" });

    const redirect = http.createServer(SERVER_OPTIONS, router.handleRedirect);
    redirect.on("upgrade", router.handleUpgrade);
    redirect.on("clientError", onClientError);
    redirect.on("error", onListenError("redirect", config.redirectPort));
    servers.push({ server: redirect, port: config.redirectPort, name: "redirect" });
};

const start = async () => {
    try {
        await db.authenticate();
    } catch (err) {
        logger.error(`Could not open ${db.storagePath}: ${err.message}`);
        process.exit(1);
    }
    await runMigrations();
    config.setupRequired = await isSetupRequired();
    try {
        applyStored(config, await require("./lib/settings").read());
    } catch (err) {
        logger.error(err.message);
        process.exit(1);
    }
    logger.info(`Database ready at ${db.storagePath}`);

    if (config.managesTls) {
        await certificates.load();
        await certificates.loadExtra();
        certificates.start();
        if (!certificates.covers()) {
            logger.warn(`No certificate for ${certificates.status().domains.join(", ")} yet`);
            logger.warn(`Until there is one, the web UI is served over plain HTTP on port ${config.redirectPort}`);
        }
    }

    await domains.load();
    if (config.ready) domains.start();
    await quotas.load();
    quotas.start();
    stats.start();
    traffic.start();
    frames.start();
    buildServers();
    let remaining = servers.length;
    for (const { server, port, name } of servers) {
        server.listen(port, config.listen, () => {
            logger.info(`tunlit ${packageJson.version} listening on ${config.listen}:${port} (${name})`);
            if (--remaining) return;
            if (config.ready) logger.info(`Base domain: ${config.baseDomain} (public URL ${config.publicUrl}, tls=${config.tlsMode}, trustProxy=${config.trustProxy})`);
            else logger.warn("baseDomain missing: only the web UI is served until the guided setup is completed");
            if (config.setupRequired) logger.warn(`No admin account yet, open ${config.publicUrl || `http://localhost:${config.port}`}/@tunlit/ to run the guided setup`);
            logger.info(`Data directory: ${dataDir()}`);
            if (!hasBuild()) logger.warn("client/dist not found: run `npm run build` in client/ to serve the web UI");
        });
    }
};

start().catch(err => {
    logger.error(`Could not start: ${err.stack || err}`);
    process.exit(1);
});

const shutdown = signal => {
    logger.info(`Received ${signal}, shutting down`);
    control.close();
    quotas.stop();
    quotas.flush().catch(() => null);
    domains.stop();
    certificates.stop();
    stats.stop();
    traffic.stop();
    frames.stop();
    for (const { server } of servers) server.close();
    setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", err => logger.error(`uncaught exception: ${err.stack || err}`));
process.on("unhandledRejection", err => logger.error(`unhandled rejection: ${err?.stack || err}`));
