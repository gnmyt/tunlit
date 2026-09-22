const { EventEmitter } = require("node:events");
const { Duplex } = require("node:stream");
const { TYPES, WINDOW_SIZE, CHUNK_SIZE, MAX_DATAGRAM, encode, decode } = require("./frames");
const logger = require("../utils/logger");

const WS_HIGH_WATER = 4 * 1024 * 1024;
const PING_INTERVAL = 20_000;
const DRAIN_INTERVAL = 20;
const DEAD_AFTER = 60_000;

class MuxStream extends Duplex {
    constructor(session, id, meta) {
        super({ readableHighWaterMark: 64 * 1024, writableHighWaterMark: 64 * 1024, allowHalfOpen: true });
        this.session = session;
        this.id = id;
        this.meta = meta;
        this.protocol = meta.protocol === "udp" ? "udp" : "tcp";
        this.sendWindow = WINDOW_SIZE;
        this.pendingUpdate = 0;
        this.writeQueue = [];
        this.closeSent = false;
        this.closeReceived = false;
        this.finished = false;
    }

    setTimeout() { return this; }
    setNoDelay() { return this; }
    setKeepAlive() { return this; }
    ref() { return this; }
    unref() { return this; }
    address() { return {}; }
    get remoteAddress() { return this.meta.remote || ""; }

    _read() {
        if (this.pendingUpdate > 0 && !this.finished && !this.closeReceived) {
            const amount = this.pendingUpdate;
            this.pendingUpdate = 0;
            const payload = Buffer.allocUnsafe(4);
            payload.writeUInt32BE(amount, 0);
            this.session._send(TYPES.WINDOW_UPDATE, this.id, payload);
        }
    }

    _write(chunk, _encoding, callback) {
        if (this.finished) return callback();
        let offset = 0;
        const pieces = [];
        while (offset < chunk.length) {
            pieces.push(chunk.subarray(offset, offset + CHUNK_SIZE));
            offset += CHUNK_SIZE;
        }
        this.writeQueue.push({ pieces, index: 0, callback });
        this._flushWrites();
    }

    _flushWrites() {
        while (this.writeQueue.length && !this.finished) {
            const item = this.writeQueue[0];
            while (item.index < item.pieces.length) {
                const piece = item.pieces[item.index];
                if (this.sendWindow < piece.length || this.session.bufferedAmount() > WS_HIGH_WATER) {
                    this.session._wantDrain(this);
                    return;
                }
                this.sendWindow -= piece.length;
                this.session._send(TYPES.DATA, this.id, piece);
                item.index++;
            }
            this.writeQueue.shift();
            item.callback();
        }
        if (this.writeQueue.length === 0 && this.finalCallback) {
            const cb = this.finalCallback;
            this.finalCallback = null;
            this._sendClose();
            cb();
        }
    }

    _final(callback) {
        if (this.finished) return callback();
        this.finalCallback = callback;
        this._flushWrites();
    }

    _sendClose() {
        if (this.closeSent || this.finished) return;
        this.closeSent = true;
        this.session._send(TYPES.CLOSE, this.id);
        this._maybeFinish();
    }

    _destroy(err, callback) {
        for (const item of this.writeQueue) item.callback(err || new Error("stream destroyed"));
        this.writeQueue = [];
        if (!this.finished) {
            this.finished = true;
            if (!this.resetReceived && !(this.closeSent && this.closeReceived)) this.session._send(TYPES.RESET, this.id);
            this.session._forget(this.id);
        }
        callback(err);
    }

    sendDatagram(data) {
        if (this.finished || data.length > MAX_DATAGRAM) return false;
        if (this.session.bufferedAmount() > WS_HIGH_WATER) return false;
        this.session._send(TYPES.DATAGRAM, this.id, data);
        return true;
    }

    _maybeFinish() {
        if (this.closeSent && this.closeReceived && !this.finished) {
            this.finished = true;
            this.session._forget(this.id);
        }
    }

    _onData(payload) {
        if (this.closeReceived || this.finished) return;
        this.pendingUpdate += payload.length;
        this.push(Buffer.from(payload));
    }

    _onClose() {
        if (this.closeReceived) return;
        this.closeReceived = true;
        this.push(null);
        this._maybeFinish();
    }

    _onReset() {
        this.resetReceived = true;
        this.destroy(new Error("stream reset by peer"));
    }

    _onWindowUpdate(amount) {
        this.sendWindow += amount;
        this._flushWrites();
    }

    _onDatagram(payload) {
        if (this.finished) return;
        this.emit("datagram", Buffer.from(payload));
    }
}

class MuxSession extends EventEmitter {
    constructor(ws, { parity = 0, name = "mux" } = {}) {
        super();
        this.ws = ws;
        this.name = name;
        this.streams = new Map();
        this.nextId = parity === 0 ? 2 : 1;
        this.closed = false;
        this.waitingForDrain = new Set();
        this.drainTimer = null;
        this.lastActivity = Date.now();
        this.bytesSent = 0;
        this.bytesReceived = 0;

        ws.on("message", (data, isBinary) => {
            this.lastActivity = Date.now();
            if (isBinary) this._onFrame(data);
            else this._onControl(data);
        });
        ws.on("close", (code, reason) => this._onSocketClose(code, reason));
        ws.on("error", err => logger.debug(`${name}: websocket error: ${err.message}`));

        this.pingTimer = setInterval(() => {
            if (Date.now() - this.lastActivity > DEAD_AFTER) {
                logger.info(`${name}: peer timed out`);
                this.close(4008, "timeout");
                return;
            }
            this.sendControl({ type: "ping" });
        }, PING_INTERVAL);
    }

    bufferedAmount() {
        return this.ws.bufferedAmount || 0;
    }

    _wantDrain(stream) {
        this.waitingForDrain.add(stream);
        if (this.drainTimer) return;
        this.drainTimer = setInterval(() => this._drain(), DRAIN_INTERVAL);
    }

    _stopDraining() {
        if (!this.drainTimer) return;
        clearInterval(this.drainTimer);
        this.drainTimer = null;
    }

    _drain() {
        if (!this.waitingForDrain.size) return this._stopDraining();
        if (this.bufferedAmount() > WS_HIGH_WATER) return;
        const waiting = [...this.waitingForDrain];
        this.waitingForDrain.clear();
        for (const stream of waiting) stream._flushWrites();
        if (!this.waitingForDrain.size) this._stopDraining();
    }

    sendControl(message) {
        if (this.closed || this.ws.readyState !== this.ws.OPEN) return;
        this.ws.send(JSON.stringify(message));
    }

    _send(type, streamId, payload) {
        if (process.env.TUNLIT_MUX_DEBUG) logger.debug(`${this.name} > type=${type} stream=${streamId} len=${payload ? payload.length : 0}`);
        if (this.closed || this.ws.readyState !== this.ws.OPEN) return;
        if (payload && (type === TYPES.DATA || type === TYPES.DATAGRAM)) this.bytesSent += payload.length;
        this.ws.send(encode(type, streamId, payload), { binary: true });
    }

    open(meta) {
        if (this.closed) throw new Error("session closed");
        const id = this.nextId;
        this.nextId += 2;
        const stream = new MuxStream(this, id, meta);
        this.streams.set(id, stream);
        this._send(TYPES.OPEN, id, JSON.stringify(meta));
        return stream;
    }

    _forget(id) {
        this.streams.delete(id);
    }

    _onControl(data) {
        let message;
        try {
            message = JSON.parse(data.toString());
        } catch {
            return;
        }
        if (!message || typeof message.type !== "string") return;
        if (message.type === "ping") return this.sendControl({ type: "pong" });
        if (message.type === "pong") return;
        this.emit("control", message);
    }

    _onFrame(data) {
        const frame = decode(data);
        if (!frame) return;
        const { type, streamId, payload } = frame;
        if (payload && (type === TYPES.DATA || type === TYPES.DATAGRAM)) this.bytesReceived += payload.length;
        const stream = this.streams.get(streamId);
        if (process.env.TUNLIT_MUX_DEBUG) logger.debug(`${this.name} < type=${type} stream=${streamId} len=${payload.length} known=${!!stream}`);

        if (type === TYPES.OPEN) {
            if (stream) return;
            let meta = {};
            try {
                meta = JSON.parse(payload.toString("utf8")) || {};
            } catch {  }
            const created = new MuxStream(this, streamId, meta);
            this.streams.set(streamId, created);
            this.emit("stream", created, meta);
            return;
        }
        if (!stream) return;
        switch (type) {
            case TYPES.DATA: return stream._onData(payload);
            case TYPES.CLOSE: return stream._onClose();
            case TYPES.RESET: return stream._onReset();
            case TYPES.DATAGRAM: return stream._onDatagram(payload);
            case TYPES.WINDOW_UPDATE:
                if (payload.length >= 4) stream._onWindowUpdate(payload.readUInt32BE(0));
                return;
            default:
                return;
        }
    }

    _onSocketClose(code, reason) {
        if (this.closed) return;
        this.closed = true;
        clearInterval(this.pingTimer);
        this._stopDraining();
        for (const stream of [...this.streams.values()]) {
            stream.resetReceived = true;
            stream.destroy(new Error("session closed"));
        }
        this.streams.clear();
        this.emit("close", code, reason?.toString());
    }

    close(code = 1000, reason = "") {
        if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
            try { this.ws.close(code, reason); } catch {  }
        }
        setTimeout(() => { try { this.ws.terminate(); } catch {  } }, 2000).unref();
    }
}

module.exports = { MuxSession };
