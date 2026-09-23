const { Op } = require("sequelize");
const Visitor = require("../models/Visitor");
const logger = require("../utils/logger");

const PER_TUNNEL_LIMIT = 500;
const PAGE_SIZE = 50;
const FLUSH_INTERVAL = 500;
const SORTABLE = { last: "lastSeen", first: "firstSeen", requests: "requests", blocked: "blocked", ip: "ip" };

const summarise = row => ({
    ip: row.ip,
    intel: JSON.parse(row.intel),
    requests: row.requests,
    blocked: row.blocked,
    reason: row.reason,
    firstSeen: new Date(row.firstSeen).getTime(),
    lastSeen: new Date(row.lastSeen).getTime(),
});

class Visitors {
    constructor({ limit = PER_TUNNEL_LIMIT, interval = FLUSH_INTERVAL } = {}) {
        this.limit = limit;
        this.interval = interval;
        this.pending = new Map();
        this.timer = null;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.flush(), this.interval);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    touch(tunnel, ip, intel) {
        const key = `${tunnel}\n${ip}`;
        const entry = this.pending.get(key) || { tunnel, ip, requests: 0, blocked: 0, reason: null, firstSeen: Date.now() };
        entry.intel = intel;
        entry.lastSeen = Date.now();
        this.pending.set(key, entry);
        return entry;
    }

    seen(tunnel, ip, intel) {
        this.touch(tunnel, ip, intel).requests += 1;
    }

    blocked(tunnel, ip, intel, reason) {
        const entry = this.touch(tunnel, ip, intel);
        entry.blocked += 1;
        entry.reason = reason;
    }

    async flush() {
        if (!this.pending.size) return;
        const batch = [...this.pending.values()];
        this.pending.clear();

        try {
            for (const entry of batch) {
                const intel = JSON.stringify(entry.intel);
                const row = await Visitor.findOne({ where: { tunnel: entry.tunnel, ip: entry.ip } });
                if (row) {
                    await Visitor.update({
                        intel,
                        requests: row.requests + entry.requests,
                        blocked: row.blocked + entry.blocked,
                        reason: entry.reason || row.reason,
                        lastSeen: new Date(entry.lastSeen),
                    }, { where: { id: row.id } });
                } else {
                    await Visitor.create({ ...entry, intel, firstSeen: new Date(entry.firstSeen), lastSeen: new Date(entry.lastSeen) });
                }
            }
            for (const tunnel of new Set(batch.map(entry => entry.tunnel))) await this.prune(tunnel);
        } catch (err) {
            logger.warn(`Could not store ${batch.length} visitor(s): ${err.message}`);
        }
    }

    async prune(tunnel) {
        const rows = await Visitor.findAll({
            where: { tunnel }, order: [["lastSeen", "DESC"]], offset: this.limit, limit: 1, attributes: ["lastSeen"],
        });
        if (rows.length) await Visitor.destroy({ where: { tunnel, lastSeen: { [Op.lte]: rows[0].lastSeen } } });
    }

    async list(tunnel, { sort = "last", order = "desc", offset = 0, limit = PAGE_SIZE } = {}) {
        await this.flush();
        const rows = await Visitor.findAll({
            where: { tunnel },
            order: [[SORTABLE[sort] || "lastSeen", order === "asc" ? "ASC" : "DESC"], ["id", "DESC"]],
            offset: Math.max(offset, 0),
            limit: Math.min(Math.max(limit, 1), PER_TUNNEL_LIMIT),
        });
        return rows.map(summarise);
    }

    count(tunnel) {
        return Visitor.count({ where: { tunnel } });
    }

    async forget(tunnel) {
        for (const [key, entry] of this.pending) if (entry.tunnel === tunnel) this.pending.delete(key);
        await Visitor.destroy({ where: { tunnel } });
    }
}

module.exports = { Visitors };
