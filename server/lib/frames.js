const TYPES = { OPEN: 0x01, DATA: 0x02, CLOSE: 0x03, WINDOW_UPDATE: 0x04, DATAGRAM: 0x05, RESET: 0x06 };
const HEADER_SIZE = 5;
const WINDOW_SIZE = 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;
const MAX_DATAGRAM = 65507;

const encode = (type, streamId, payload) => {
    const body = payload ? (Buffer.isBuffer(payload) ? payload : Buffer.from(payload)) : Buffer.alloc(0);
    const frame = Buffer.allocUnsafe(HEADER_SIZE + body.length);
    frame[0] = type;
    frame.writeUInt32BE(streamId >>> 0, 1);
    body.copy(frame, HEADER_SIZE);
    return frame;
};

const decode = buffer => {
    if (!Buffer.isBuffer(buffer) || buffer.length < HEADER_SIZE) return null;
    return { type: buffer[0], streamId: buffer.readUInt32BE(1), payload: buffer.subarray(HEADER_SIZE) };
};

module.exports = { TYPES, WINDOW_SIZE, CHUNK_SIZE, MAX_DATAGRAM, encode, decode };
