const MAX_FRAME = 16 * 1024 * 1024;

class FrameParser {
    constructor(onMessage, { skipHead = false } = {}) {
        this.onMessage = onMessage;
        this.buffer = Buffer.alloc(0);
        this.fragments = null;
        this.dead = false;
        this.awaitingHead = skipHead;
    }

    push(chunk) {
        if (this.dead) return;
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
        if (this.awaitingHead) {
            const end = this.buffer.indexOf("\r\n\r\n");
            if (end === -1) return;
            this.buffer = this.buffer.subarray(end + 4);
            this.awaitingHead = false;
        }
        this.drain();
    }

    drain() {
        for (;;) {
            const buffer = this.buffer;
            if (buffer.length < 2) return;
            const fin = (buffer[0] & 0x80) !== 0;
            const opcode = buffer[0] & 0x0f;
            const masked = (buffer[1] & 0x80) !== 0;
            let length = buffer[1] & 0x7f;
            let offset = 2;
            if (length === 126) {
                if (buffer.length < 4) return;
                length = buffer.readUInt16BE(2);
                offset = 4;
            } else if (length === 127) {
                if (buffer.length < 10) return;
                length = Number(buffer.readBigUInt64BE(2));
                offset = 10;
            }
            if (length > MAX_FRAME) {
                this.dead = true;
                this.buffer = Buffer.alloc(0);
                return;
            }
            const start = offset + (masked ? 4 : 0);
            if (buffer.length < start + length) return;
            let payload = Buffer.from(buffer.subarray(start, start + length));
            if (masked) {
                const key = buffer.subarray(offset, offset + 4);
                for (let i = 0; i < length; i++) payload[i] ^= key[i & 3];
            }
            this.buffer = buffer.subarray(start + length);

            if (opcode >= 8) {
                this.onMessage(opcode, payload);
            } else if (opcode === 0) {
                if (!this.fragments) continue;
                this.fragments.parts.push(payload);
                if (fin) {
                    const { opcode: first, parts } = this.fragments;
                    this.fragments = null;
                    this.onMessage(first, Buffer.concat(parts));
                }
            } else if (fin) {
                this.onMessage(opcode, payload);
            } else {
                this.fragments = { opcode, parts: [payload] };
            }
        }
    }
}

module.exports = { FrameParser };
