const { Op } = require("sequelize");
const Connection = require("../models/Connection");
const { randomToken } = require("../utils/ids");
const { sniff } = require("./sniff");
const logger = require("../utils/logger");

const PER_TUNNEL_LIMIT = 500;
const PAGE_SIZE = 50;
const FLUSH_INTERVAL = 500;
const SORTABLE = { started: "startedAt", in: "bytesIn", out: "bytesOut", ip: "ip" };

const serialize = row => ({
    key: row.key,
    protocol: row.protocol,
    ip: row.ip,
    intel: JSON.parse(row.intel),
    client: row.client,
    joiner: row.joiner,
    startedAt: new Date(row.startedAt).getTime(),
    endedAt: row.endedAt ? new Date(row.endedAt).getTime() : null,
    bytesIn: row.bytesIn,
    bytesOut: row.bytesOut,
    reason: row.reason,
    detail: row.detail && JSON.parse(row.detail),
});

class ConnectionLog {
    constructor() {
        this.live = new Map();
        this.inserts = [];
        this.dirty = new Set();
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

    open(tunnel, { protocol, ip, intel, client, joiner }) {
        const entry = {
            key: randomToken(16), tunnel, protocol, ip, intel, client, joiner,
            startedAt: Date.now(), endedAt: null, bytesIn: 0, bytesOut: 0, reason: null, detail: null,
            sniffed: { in: false, out: false },
        };
        this.live.set(entry.key, entry);
        this.inserts.push(entry);
        return entry;
    }

    data(entry, direction, buffer) {
        entry[direction === "in" ? "bytesIn" : "bytesOut"] += buffer.length;
        if (!entry.sniffed[direction]) {
            entry.sniffed[direction] = true;
            if (!entry.detail) {
                entry.detail = sniff(entry.protocol, direction, buffer);
                if (entry.detail) this.dirty.add(entry.key);
            }
        }
    }

    close(entry, reason) {
        entry.endedAt = Date.now();
        entry.reason = reason;
        this.dirty.add(entry.key);
    }

    async flush() {
        const inserts = this.inserts;
        const dirty = [...this.dirty];
        this.inserts = [];
        this.dirty.clear();
        if (!inserts.length && !dirty.length) return;
        try {
            if (inserts.length) {
                await Connection.bulkCreate(inserts.map(entry => ({ ...entry, intel: JSON.stringify(entry.intel), detail: entry.detail && JSON.stringify(entry.detail), startedAt: new Date(entry.startedAt), endedAt: entry.endedAt && new Date(entry.endedAt) })));
                for (const tunnel of new Set(inserts.map(entry => entry.tunnel))) await this.prune(tunnel);
            }
            const fresh = new Set(inserts.map(entry => entry.key));
            for (const key of dirty) {
                const entry = this.live.get(key);
                if (!fresh.has(key)) await this.update(entry);
                if (entry.endedAt) this.live.delete(key);
            }
        } catch (err) {
            logger.warn(`Could not store connections: ${err.message}`);
        }
    }

    update(entry) {
        return Connection.update({
            bytesIn: entry.bytesIn, bytesOut: entry.bytesOut, reason: entry.reason,
            detail: entry.detail && JSON.stringify(entry.detail), endedAt: entry.endedAt && new Date(entry.endedAt),
        }, { where: { key: entry.key } });
    }

    async prune(tunnel) {
        const rows = await Connection.findAll({
            where: { tunnel, endedAt: { [Op.ne]: null } }, order: [["startedAt", "DESC"]], offset: PER_TUNNEL_LIMIT, limit: 1, attributes: ["startedAt"],
        });
        if (!rows.length) return;
        await Connection.destroy({ where: { tunnel, endedAt: { [Op.ne]: null }, startedAt: { [Op.lte]: rows[0].startedAt } } });
    }

    current(row) {
        const live = this.live.get(row.key);
        return live ? { ...serialize(row), bytesIn: live.bytesIn, bytesOut: live.bytesOut, detail: live.detail } : serialize(row);
    }

    async list(tunnel, { sort = "started", order = "desc", offset = 0, limit = PAGE_SIZE } = {}) {
        await this.flush();
        const rows = await Connection.findAll({
            where: { tunnel },
            order: [[SORTABLE[sort] || "startedAt", order === "asc" ? "ASC" : "DESC"], ["id", "DESC"]],
            offset: Math.max(offset, 0),
            limit: Math.min(Math.max(limit, 1), PER_TUNNEL_LIMIT),
        });
        return rows.map(row => this.current(row));
    }

    count(tunnel) {
        return Connection.count({ where: { tunnel } });
    }

    async get(tunnel, key) {
        await this.flush();
        const row = await Connection.findOne({ where: { tunnel, key } });
        return row ? this.current(row) : null;
    }

    async clear(tunnel) {
        await this.flush();
        await Connection.destroy({ where: { tunnel, endedAt: { [Op.ne]: null } } });
    }

    async forget(tunnel) {
        for (const [key, entry] of this.live) if (entry.tunnel === tunnel) this.live.delete(key);
        this.inserts = this.inserts.filter(entry => entry.tunnel !== tunnel);
        await Connection.destroy({ where: { tunnel } });
    }
}

module.exports = { ConnectionLog };
