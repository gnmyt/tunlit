const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE) (\S+) HTTP\/1\.[01]\r\n/;

const varint = (buffer, offset) => {
    let value = 0;
    let shift = 0;
    for (let i = offset; i < buffer.length && shift < 35; i++) {
        value |= (buffer[i] & 0x7f) << shift;
        if ((buffer[i] & 0x80) === 0) return [value, i + 1];
        shift += 7;
    }
    return null;
};

const tls = buffer => {
    if (buffer.length < 44 || buffer[0] !== 0x16 || buffer[1] !== 0x03 || buffer[5] !== 0x01) return null;
    let at = 43;
    at += 1 + buffer[at];
    if (at + 2 > buffer.length) return { name: "TLS", info: null };
    at += 2 + buffer.readUInt16BE(at);
    if (at + 1 > buffer.length) return { name: "TLS", info: null };
    at += 1 + buffer[at];
    if (at + 2 > buffer.length) return { name: "TLS", info: null };
    const end = Math.min(buffer.length, at + 2 + buffer.readUInt16BE(at));
    at += 2;
    let sni = null;
    const alpn = [];
    while (at + 4 <= end) {
        const type = buffer.readUInt16BE(at);
        const length = buffer.readUInt16BE(at + 2);
        const body = buffer.subarray(at + 4, Math.min(end, at + 4 + length));
        if (type === 0 && body.length >= 5) sni = body.subarray(5, 5 + body.readUInt16BE(3)).toString("utf8");
        if (type === 16 && body.length >= 2) {
            let cursor = 2;
            while (cursor < body.length) {
                const size = body[cursor];
                alpn.push(body.subarray(cursor + 1, cursor + 1 + size).toString("utf8"));
                cursor += 1 + size;
            }
        }
        at += 4 + length;
    }
    return { name: "TLS", info: [sni, alpn.length ? alpn.join(", ") : null].filter(Boolean).join(" · ") || null };
};

const http = buffer => {
    const head = buffer.subarray(0, 2048).toString("latin1");
    if (head.startsWith("PRI * HTTP/2.0\r\n")) return { name: "HTTP/2", info: null };
    const match = METHODS.exec(head);
    if (!match) return null;
    const host = /\r\nhost:\s*([^\r\n]+)/i.exec(head);
    return { name: "HTTP", info: [host?.[1], `${match[1]} ${match[2]}`].filter(Boolean).join(" · ") };
};

const ssh = buffer => {
    if (!buffer.subarray(0, 4).equals(Buffer.from("SSH-"))) return null;
    return { name: "SSH", info: buffer.subarray(0, 64).toString("latin1").split("\r\n")[0].slice(0, 48) };
};

const postgres = buffer => {
    if (buffer.length < 8) return null;
    const length = buffer.readUInt32BE(0);
    const code = buffer.readUInt32BE(4);
    if (code === 80877103 || code === 80877104) return { name: "PostgreSQL", info: null };
    if (code !== 196608 || length > 10000) return null;
    const params = buffer.subarray(8, Math.min(length, buffer.length)).toString("utf8").split("\0");
    const pairs = {};
    for (let i = 0; i + 1 < params.length; i += 2) pairs[params[i]] = params[i + 1];
    return { name: "PostgreSQL", info: [pairs.user, pairs.database].filter(Boolean).join(" @ ") || null };
};

const mysql = buffer => {
    if (buffer.length < 6 || buffer[3] !== 0 || buffer[4] !== 0x0a) return null;
    const end = buffer.indexOf(0, 5);
    if (end === -1 || end > 64) return null;
    return { name: "MySQL", info: buffer.subarray(5, end).toString("latin1") };
};

const redis = buffer => {
    const head = buffer.subarray(0, 64).toString("latin1");
    const match = /^\*\d+\r\n\$\d+\r\n([A-Za-z]+)\r\n/.exec(head);
    return match ? { name: "Redis", info: match[1].toUpperCase() } : null;
};

const mqtt = buffer => {
    if (buffer[0] !== 0x10) return null;
    const head = varint(buffer, 1);
    if (!head) return null;
    const at = head[1];
    if (buffer.length < at + 6 || buffer.readUInt16BE(at) !== 4 || buffer.subarray(at + 2, at + 6).toString("latin1") !== "MQTT") return null;
    return { name: "MQTT", info: null };
};

const minecraft = buffer => {
    const length = varint(buffer, 0);
    if (!length || buffer[length[1]] !== 0) return null;
    const version = varint(buffer, length[1] + 1);
    if (!version) return null;
    const host = varint(buffer, version[1]);
    if (!host || host[0] > 255 || host[1] + host[0] + 3 > buffer.length) return null;
    const name = buffer.subarray(host[1], host[1] + host[0]).toString("utf8");
    const port = buffer.readUInt16BE(host[1] + host[0]);
    const state = buffer[host[1] + host[0] + 2];
    if (!/^[\w.:-]+$/.test(name) || (state !== 1 && state !== 2)) return null;
    return { name: "Minecraft", info: `${name}:${port} · ${state === 1 ? "status" : "login"}` };
};

const dns = buffer => {
    if (buffer.length < 17 || (buffer[2] & 0x80) !== 0 || buffer.readUInt16BE(4) !== 1) return null;
    const labels = [];
    let at = 12;
    while (at < buffer.length && buffer[at] !== 0) {
        const size = buffer[at];
        if (size > 63 || at + 1 + size > buffer.length) return null;
        labels.push(buffer.subarray(at + 1, at + 1 + size).toString("latin1"));
        at += 1 + size;
    }
    if (!labels.length) return null;
    return { name: "DNS", info: labels.join(".") };
};

const wireguard = buffer => (buffer.length === 148 && buffer[0] === 1 && buffer[1] === 0 && buffer[2] === 0 && buffer[3] === 0 ? { name: "WireGuard", info: null } : null);

const quic = buffer => (buffer.length >= 5 && (buffer[0] & 0xc0) === 0xc0 && buffer.readUInt32BE(1) === 1 ? { name: "QUIC", info: null } : null);

const TCP_IN = [tls, http, ssh, postgres, redis, mqtt, minecraft];
const TCP_OUT = [ssh, mysql];
const UDP = [dns, quic, wireguard];

const sniff = (protocol, direction, buffer) => {
    if (!buffer.length) return null;
    const detectors = protocol === "udp" ? UDP : direction === "in" ? TCP_IN : TCP_OUT;
    for (const detector of detectors) {
        const result = detector(buffer);
        if (result) return result;
    }
    return null;
};

module.exports = { sniff };
