const http = require("node:http");
const zlib = require("node:zlib");
const { Transform } = require("node:stream");
const { randomToken } = require("../utils/ids");
const { FrameParser, encodeFrame } = require("./websocket");
const { sendAppState } = require("../utils/pages");
const { Tap, headerList } = require("./capture");
const logger = require("../utils/logger");

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);
const QUERY_PARAM = "tunlit-tunnel";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

const requestInfo = (req, config) => {
    const trust = config.trustProxy;
    const forwardedHost = trust && req.headers["x-forwarded-host"] ? String(req.headers["x-forwarded-host"]).split(",")[0].trim() : null;
    const hostHeader = forwardedHost || req.headers.host || "";
    const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
    const forwardedProto = trust && req.headers["x-forwarded-proto"] ? String(req.headers["x-forwarded-proto"]).split(",")[0].trim().toLowerCase() : null;
    const proto = forwardedProto || (req.socket.encrypted ? "https" : "http");
    const forwardedFor = trust && req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : null;
    const clientIp = forwardedFor || req.socket.remoteAddress || "";
    return { host: hostHeader, hostname, proto, secure: proto === "https", clientIp };
};

const classifyHost = (hostname, baseDomain) => {
    if (hostname === baseDomain) return { kind: "base" };
    if (hostname.endsWith(`.${baseDomain}`)) {
        const label = hostname.slice(0, -(baseDomain.length + 1));
        if (label && !label.includes(".")) return { kind: "subdomain", id: label };
    }
    return { kind: "unknown" };
};

const stripQueryParam = url => {
    const idx = url.indexOf("?");
    if (idx === -1) return url;
    const path = url.slice(0, idx);
    const params = new URLSearchParams(url.slice(idx + 1));
    if (!params.has(QUERY_PARAM)) return url;
    params.delete(QUERY_PARAM);
    const rest = params.toString();
    return rest ? `${path}?${rest}` : path;
};

const hostHeader = target => (target.port === 80 || target.port === 443 ? target.host : target.authority);

const buildUpstreamHeaders = (req, info, tunnel, { pathMode }) => {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.has(name) || name === "host") continue;
        headers[name] = value;
    }
    headers.host = tunnel.keepHost ? info.host : hostHeader(tunnel.target);
    headers["x-forwarded-host"] = info.host;
    headers["x-forwarded-proto"] = info.proto;
    headers["x-forwarded-for"] = req.headers["x-forwarded-for"] && !headers["x-forwarded-for"] ? req.headers["x-forwarded-for"] : (info.clientIp || "");
    if (headers["x-forwarded-for"] === "") delete headers["x-forwarded-for"];
    return headers;
};

const appendCookie = (headers, cookie) => {
    const name = Object.keys(headers).find(key => key.toLowerCase() === "set-cookie") || "set-cookie";
    const existing = headers[name];
    headers[name] = existing ? [...(Array.isArray(existing) ? existing : [existing]), cookie] : [cookie];
};

const sameAuthority = (a, b) => {
    if (a === b) return true;
    const pa = a.match(/^(.*):(\d+)$/), pb = b.match(/^(.*):(\d+)$/);
    if (!pa || !pb || pa[2] !== pb[2]) return false;
    return LOCAL_HOSTS.has(pa[1].toLowerCase()) && LOCAL_HOSTS.has(pb[1].toLowerCase());
};

const authorityOf = url => (url.port ? url.host : `${url.hostname}:${url.protocol === "https:" ? 443 : 80}`);

const rewriteLocation = (location, tunnel, info, { pathMode }) => {
    let url;
    try {
        url = new URL(location, `http://${tunnel.target.authority}/`);
    } catch {
        return location;
    }
    if (!/^https?:$/.test(url.protocol)) return location;
    if (!sameAuthority(authorityOf(url), tunnel.target.authority)) return location;
    const rest = `${url.pathname}${url.search}${url.hash}`;
    return pathMode ? rest : `${info.proto}://${info.host}${rest}`;
};

const rewriteSetCookie = value => {
    const parts = String(value).split(";").map(p => p.trim()).filter(Boolean);
    if (!parts.length) return value;
    const out = [parts[0]];
    for (const attr of parts.slice(1)) {
        const [name, ...rest] = attr.split("=");
        const key = name.trim().toLowerCase();
        if (key === "domain") continue;
        if (key === "expires") {
            const date = Date.parse(rest.join("="));
            if (!Number.isNaN(date) && date >= Date.now()) continue;
        }
        out.push(attr);
    }
    return out.join("; ");
};

const buildDownstreamHeaders = (upstream, tunnel, info, { pathMode }) => {
    const headers = {};
    for (let i = 0; i < upstream.rawHeaders.length; i += 2) {
        const name = upstream.rawHeaders[i];
        const key = name.toLowerCase();
        let value = upstream.rawHeaders[i + 1];
        if (HOP_BY_HOP.has(key)) continue;
        if (key === "location") value = rewriteLocation(value, tunnel, info, { pathMode });
        if (key === "set-cookie" && pathMode) value = rewriteSetCookie(value);
        if (headers[name] === undefined) headers[name] = value;
        else if (Array.isArray(headers[name])) headers[name].push(value);
        else headers[name] = [headers[name], value];
    }
    return headers;
};

class InjectTransform extends Transform {
    constructor(snippet) {
        super();
        this.snippet = Buffer.from(snippet);
        this.carry = Buffer.alloc(0);
        this.done = false;
    }

    _transform(chunk, _enc, cb) {
        if (this.done) return cb(null, chunk);
        const buf = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;
        const lower = buf.toString("latin1").toLowerCase();
        const idx = lower.indexOf("</head>");
        if (idx !== -1) {
            this.done = true;
            this.carry = Buffer.alloc(0);
            return cb(null, Buffer.concat([buf.subarray(0, idx), this.snippet, buf.subarray(idx)]));
        }
        const keep = Math.min(6, buf.length);
        this.carry = Buffer.from(buf.subarray(buf.length - keep));
        cb(null, buf.subarray(0, buf.length - keep));
    }

    _flush(cb) {
        if (this.done) return cb(null, this.carry);
        cb(null, Buffer.concat([this.carry, this.snippet]));
    }
}

const decoderFor = encoding => {
    switch ((encoding || "").trim().toLowerCase()) {
        case "gzip": case "x-gzip": return zlib.createGunzip();
        case "deflate": return zlib.createInflate();
        case "br": return zlib.createBrotliDecompress();
        case "zstd": return typeof zlib.createZstdDecompress === "function" ? zlib.createZstdDecompress() : null;
        case "": case "identity": return "identity";
        default: return null;
    }
};

const observe = (req, info, onRequest) => {
    if (!onRequest) return;
    const startedAt = Date.now();
    let done = false;
    const finish = (status, captured = {}) => {
        if (done) return;
        done = true;
        onRequest({
            time: startedAt,
            duration: Date.now() - startedAt,
            kind: "http",
            method: req.method,
            path: stripQueryParam(req.url),
            status,
            ip: info.clientIp,
            host: info.host,
            request: { headers: headerList(req.headers), ...(captured.request || {}) },
            response: captured.response || {},
        });
    };
    return finish;
};

const proxyRequest = (req, res, tunnel, info, { pathMode, inject: snippet, onRequest, setCookie }) => {
    const stream = tunnel.session.open({ protocol: "tcp", remote: info.clientIp });
    const headers = buildUpstreamHeaders(req, info, tunnel, { pathMode });
    const wantsHtml = pathMode && (/text\/html/i.test(req.headers.accept || "") || req.headers["sec-fetch-dest"] === "document");
    if (wantsHtml) delete headers["accept-encoding"];

    const upstream = http.request({
        createConnection: () => stream,
        method: req.method,
        path: stripQueryParam(req.url),
        headers,
        setHost: false,
    });

    const finish = observe(req, info, onRequest);
    const requestTap = finish ? new Tap() : null;
    let responseTap = null;
    const captured = () => ({
        request: requestTap ? requestTap.result() : {},
        response: responseTap ? responseTap.result() : {},
    });
    let responded = false;
    const fail = (status, message) => {
        if (responded || res.headersSent) return res.destroy();
        responded = true;
        logger.debug(`proxy ${tunnel.id}: ${message}`);
        if (finish) finish(status, captured());

        if (status === 502) sendAppState(req, res, 502, { kind: "offline", id: tunnel.id });
        else res.writeHead(status, { "Content-Type": "text/plain" }).end(message);
    };

    upstream.on("error", err => fail(502, `upstream error: ${err.message}`));
    stream.on("error", () => {});
    req.on("error", () => upstream.destroy());
    res.on("close", () => { if (!res.writableFinished) upstream.destroy(); });

    upstream.on("response", upstreamRes => {
        responded = true;
        if (finish) {
            responseTap = new Tap();
            res.on("close", () => finish(upstreamRes.statusCode, {
                ...captured(),
                response: { ...responseTap.result(), headers: headerList(upstreamRes.headers) },
            }));
        }
        const outHeaders = buildDownstreamHeaders(upstreamRes, tunnel, info, { pathMode });
        const contentType = String(upstreamRes.headers["content-type"] || "");
        const inject = !!snippet && upstreamRes.statusCode === 200 && /^text\/html/i.test(contentType);
        let body = upstreamRes;

        if (inject) {
            const decoder = decoderFor(upstreamRes.headers["content-encoding"]);
            if (decoder) {
                for (const name of Object.keys(outHeaders)) {
                    const key = name.toLowerCase();
                    if (key === "content-length" || key === "content-encoding") delete outHeaders[name];
                }
                if (decoder !== "identity") {
                    decoder.on("error", () => res.destroy());
                    body = upstreamRes.pipe(decoder);
                }
                body = body.pipe(new InjectTransform(snippet));
            }
        }
        if (setCookie) appendCookie(outHeaders, setCookie);
        res.writeHead(upstreamRes.statusCode, upstreamRes.statusMessage, outHeaders);
        if (responseTap) body = body.pipe(responseTap);
        body.pipe(res);
        upstreamRes.on("error", () => res.destroy());
    });

    if (requestTap) req.pipe(requestTap).pipe(upstream);
    else req.pipe(upstream);
};

const replayRequest = (tunnel, stored, onRequest) => new Promise(resolve => {
    const headers = {};
    for (const [name, value] of stored.request.headers) {
        const key = name.toLowerCase();
        if (HOP_BY_HOP.has(key) || key === "host" || key === "content-length" || value === "[hidden]") continue;
        headers[name] = headers[name] === undefined ? value : [].concat(headers[name], value);
    }
    headers.host = tunnel.keepHost ? stored.host : hostHeader(tunnel.target);
    headers["x-forwarded-host"] = stored.host;
    const body = stored.request.body ? Buffer.from(stored.request.body, "base64") : null;
    if (body) headers["content-length"] = body.length;

    const startedAt = Date.now();
    const stream = tunnel.session.open({ protocol: "tcp", remote: "replay" });
    const upstream = http.request({ createConnection: () => stream, method: stored.method, path: stored.path, headers, setHost: false });
    let settled = false;
    const done = (status, response) => {
        if (settled) return;
        settled = true;
        onRequest({
            time: startedAt,
            duration: Date.now() - startedAt,
            kind: "http",
            method: stored.method,
            path: stored.path,
            status,
            ip: "replay",
            host: stored.host,
            request: { headers: headerList(headers), body, bytes: body?.length || 0, truncated: false },
            response,
        });
        resolve(status);
    };

    stream.on("error", () => {});
    upstream.on("error", () => done(502, {}));
    upstream.on("response", response => {
        const tap = new Tap();
        response.on("error", () => done(502, {}));
        response.pipe(tap).on("finish", () => done(response.statusCode, { ...tap.result(), headers: headerList(response.headers) })).resume();
    });
    upstream.end(body);
});

const tap = parser => new Transform({
    transform(chunk, _encoding, callback) {
        parser.push(chunk);
        callback(null, chunk);
    },
});

const proxyUpgrade = (req, socket, head, tunnel, info, { pathMode, ws }) => {
    const stream = tunnel.session.open({ protocol: "tcp", remote: info.clientIp });
    const headers = buildUpstreamHeaders(req, info, tunnel, { pathMode });
    headers.connection = "Upgrade";
    headers.upgrade = req.headers.upgrade;

    let raw = `${req.method} ${stripQueryParam(req.url)} HTTP/1.1\r\n`;
    for (const [name, value] of Object.entries(headers)) {
        for (const v of [].concat(value)) raw += `${name}: ${v}\r\n`;
    }
    raw += "\r\n";

    const connection = randomToken(16);
    const startedAt = Date.now();
    const entry = { time: startedAt, kind: "ws", method: req.method, path: stripQueryParam(req.url), status: 101, ip: info.clientIp, host: info.host, connection };
    ws.open({ ...entry, duration: 0, request: { headers: headerList(req.headers) }, response: {} }, {
        in: payload => stream.write(encodeFrame(1, payload, true)),
        out: payload => socket.write(encodeFrame(1, payload, false)),
    });
    socket.on("close", () => ws.close(connection, { ...entry, duration: Date.now() - startedAt }));
    const incoming = new FrameParser((opcode, payload) => ws.frame(connection, "in", opcode, payload));
    const outgoing = new FrameParser((opcode, payload) => ws.frame(connection, "out", opcode, payload), { skipHead: true });

    stream.write(raw);
    if (head.length) {
        stream.write(head);
        incoming.push(head);
    }
    socket.setNoDelay(true);
    socket.pipe(tap(incoming)).pipe(stream).pipe(tap(outgoing)).pipe(socket);
    const bail = () => { socket.destroy(); stream.destroy(); };
    stream.on("error", bail);
    socket.on("error", bail);
    socket.on("close", () => stream.destroy());
    stream.on("close", () => socket.destroy());
};

module.exports = { requestInfo, classifyHost, proxyRequest, proxyUpgrade, replayRequest, QUERY_PARAM };
