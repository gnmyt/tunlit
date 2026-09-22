const logger = require("../utils/logger");

const relayStream = (tunnel, joinerStream, meta) => {
    if (!tunnel.online) {
        joinerStream.destroy(new Error("owner offline"));
        return;
    }
    const ownerStream = tunnel.session.open({ protocol: meta.protocol === "udp" ? "udp" : "tcp", remote: meta.remote || "" });

    if (ownerStream.protocol === "udp") {
        joinerStream.on("datagram", data => ownerStream.sendDatagram(data));
        ownerStream.on("datagram", data => joinerStream.sendDatagram(data));
    }
    joinerStream.pipe(ownerStream).pipe(joinerStream);

    const teardown = () => { joinerStream.destroy(); ownerStream.destroy(); };
    joinerStream.on("error", teardown);
    ownerStream.on("error", teardown);
    joinerStream.on("close", () => ownerStream.destroy());
    ownerStream.on("close", () => joinerStream.destroy());
    logger.debug(`relay ${tunnel.id}: ${ownerStream.protocol} stream ${joinerStream.id} -> ${ownerStream.id}`);
};

const attachJoiner = (tunnel, session) => {
    session.on("stream", (stream, meta) => relayStream(tunnel, stream, meta));
};

module.exports = { attachJoiner };
