const { PassThrough } = require("node:stream");
const logger = require("../utils/logger");

const ANNOUNCE_DELAY = 150;

const tap = observe => new PassThrough({
    transform(chunk, _encoding, callback) {
        observe(chunk);
        callback(null, chunk);
    },
});

const summary = entry => ({
    key: entry.key,
    protocol: entry.protocol,
    ip: entry.ip,
    country: entry.intel.country,
    org: entry.intel.org,
    client: entry.client,
    bytesIn: entry.bytesIn,
    bytesOut: entry.bytesOut,
    duration: (entry.endedAt || Date.now()) - entry.startedAt,
    reason: entry.reason,
    detail: entry.detail,
});

const relayStream = (tunnel, session, joinerStream, meta, { connections, intel, visitors }) => {
    if (!tunnel.online) {
        joinerStream.destroy(new Error("owner offline"));
        return;
    }
    const protocol = meta.protocol === "udp" ? "udp" : "tcp";
    const ip = session.client.ip;
    const details = intel.lookup(ip);
    const entry = connections.open(tunnel.id, { protocol, ip, intel: details, client: meta.remote || "", joiner: session.client.id });
    visitors.seen(tunnel.id, ip, details);
    const ownerStream = tunnel.session.open({ protocol, remote: meta.remote || "" });

    const announce = event => {
        if (tunnel.session && !tunnel.session.closed) tunnel.session.sendControl({ type: "connection", event, ...summary(entry) });
    };
    let announced = false;
    const opened = () => {
        if (announced) return;
        announced = true;
        clearTimeout(timer);
        announce("open");
    };
    const timer = setTimeout(opened, ANNOUNCE_DELAY);
    const observe = direction => chunk => {
        connections.data(entry, direction, chunk);
        if (entry.detail) opened();
    };

    if (protocol === "udp") {
        joinerStream.on("datagram", data => { observe("in")(data); ownerStream.sendDatagram(data); });
        ownerStream.on("datagram", data => { observe("out")(data); joinerStream.sendDatagram(data); });
    }
    joinerStream.pipe(tap(observe("in"))).pipe(ownerStream);
    ownerStream.pipe(tap(observe("out"))).pipe(joinerStream);

    let reason = null;
    const finish = cause => {
        if (!reason) reason = cause;
        if (entry.endedAt) return;
        connections.close(entry, reason);
        opened();
        announce("close");
    };
    joinerStream.on("error", () => { finish(session.closed ? "client disconnected" : "error"); ownerStream.destroy(); });
    ownerStream.on("error", () => { finish(tunnel.session.closed ? "tunnel closed" : "error"); joinerStream.destroy(); });
    joinerStream.on("close", () => { finish("client closed"); ownerStream.destroy(); });
    ownerStream.on("close", () => { finish("app closed"); joinerStream.destroy(); });
    logger.debug(`relay ${tunnel.id}: ${protocol} stream ${joinerStream.id} -> ${ownerStream.id}`);
};

const attachJoiner = (tunnel, session, context) => {
    session.on("stream", (stream, meta) => relayStream(tunnel, session, stream, meta, context));
};

module.exports = { attachJoiner };
