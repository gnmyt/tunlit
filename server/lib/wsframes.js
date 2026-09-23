const { Op } = require("sequelize");
const Frame = require("../models/Frame");
const logger = require("../utils/logger");

const MAX_PAYLOAD = 16 * 1024;
const PER_CONNECTION = 500;
const FLUSH_INTERVAL = 500;

const summarise = row => ({
    id: row.id,
    direction: row.direction,
    opcode: row.opcode,
    time: new Date(row.time).getTime(),
    bytes: row.bytes,
    truncated: !!row.truncated,
    payload: row.payload ? Buffer.from(row.payload).toString("base64") : null,
});

class FrameLog {
    constructor() {
        this.pending = [];
        this.open = new Map();
        this.timer = null;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    opened(connection, writers) {
        this.open.set(connection, writers);
    }

    closed(connection) {
        this.open.delete(connection);
    }

    isOpen(connection) {
        return this.open.has(connection);
    }

    inject(tunnel, connection, direction, payload) {
        const writers = this.open.get(connection);
        if (!writers) return false;
        writers[direction](payload);
        this.record(tunnel, connection, direction, 1, payload);
        return true;
    }

    record(tunnel, connection, direction, opcode, payload) {
        this.pending.push({
            tunnel, connection, direction, opcode,
            time: new Date(),
            bytes: payload.length,
            payload: payload.length ? payload.subarray(0, MAX_PAYLOAD) : null,
            truncated: payload.length > MAX_PAYLOAD,
        });
    }

    async flush() {
        if (!this.pending.length) return;
        const batch = this.pending;
        this.pending = [];
        try {
            await Frame.bulkCreate(batch);
            for (const connection of new Set(batch.map(row => row.connection))) await this.prune(connection);
        } catch (err) {
            logger.warn(`Could not store ${batch.length} frame(s): ${err.message}`);
        }
    }

    async prune(connection) {
        const rows = await Frame.findAll({ where: { connection }, order: [["id", "DESC"]], offset: PER_CONNECTION, limit: 1, attributes: ["id"] });
        if (rows.length) await Frame.destroy({ where: { connection, id: { [Op.lte]: rows[0].id } } });
    }

    async list(tunnel, connection, after = 0) {
        await this.flush();
        const where = { tunnel, connection };
        if (after) where.id = { [Op.gt]: after };
        const rows = await Frame.findAll({ where, order: [["id", "ASC"]], limit: PER_CONNECTION });
        return rows.map(summarise);
    }

    async forConnections(tunnel, connections) {
        await this.flush();
        const rows = await Frame.findAll({ where: { tunnel, connection: connections }, order: [["id", "ASC"]] });
        const grouped = new Map();
        for (const row of rows) {
            if (!grouped.has(row.connection)) grouped.set(row.connection, []);
            grouped.get(row.connection).push(summarise(row));
        }
        return grouped;
    }
}

module.exports = { FrameLog };
