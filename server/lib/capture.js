const { Transform } = require("node:stream");

const MAX_BODY = 64 * 1024;
const SKIP_HEADERS = new Set(["cookie", "set-cookie", "authorization", "proxy-authorization"]);

class Tap extends Transform {
    constructor(limit = MAX_BODY) {
        super();
        this.limit = limit;
        this.chunks = [];
        this.kept = 0;
        this.total = 0;
    }

    _transform(chunk, _encoding, callback) {
        this.total += chunk.length;
        if (this.kept < this.limit) {
            const room = this.limit - this.kept;
            const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
            this.chunks.push(piece);
            this.kept += piece.length;
        }
        callback(null, chunk);
    }

    result() {
        return {
            body: this.chunks.length ? Buffer.concat(this.chunks, this.kept) : null,
            bytes: this.total,
            truncated: this.total > this.kept,
        };
    }
}

const headerList = headers => {
    const out = [];
    for (const [name, value] of Object.entries(headers || {})) {
        if (SKIP_HEADERS.has(name.toLowerCase())) {
            out.push([name, "[hidden]"]);
            continue;
        }
        for (const one of [].concat(value)) out.push([name, String(one)]);
    }
    return out;
};

module.exports = { Tap, headerList, MAX_BODY };
