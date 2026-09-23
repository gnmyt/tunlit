const { Op } = require("sequelize");
const Request = require("../models/Request");
const Frame = require("../models/Frame");
const logger = require("../utils/logger");

const PER_TUNNEL_LIMIT = 200;
const PAGE_SIZE = 50;
const SORTABLE = { time: "id", status: "status", duration: "duration", path: "path", method: "method" };

const criteria = (tunnelId, { search, methods = [], statuses = [], countries = [] }) => {
    const where = { tunnel: tunnelId };
    if (search) where[Op.or] = [{ path: { [Op.like]: `%${search}%` } }, { ip: { [Op.like]: `%${search}%` } }];
    if (methods.length) {
        const wantsWs = methods.includes("WS");
        const plain = methods.filter(method => method !== "WS");
        const options = [];
        if (plain.length) options.push({ kind: "http", method: plain });
        if (wantsWs) options.push({ kind: "ws" });
        where[Op.and] = [...(where[Op.and] || []), { [Op.or]: options }];
    }
    if (statuses.length) {
        where[Op.and] = [...(where[Op.and] || []), { [Op.or]: statuses.map(hundreds => ({ status: { [Op.between]: [hundreds * 100, hundreds * 100 + 99] } })) }];
    }
    if (countries.length) {
        where[Op.and] = [...(where[Op.and] || []), { [Op.or]: countries.map(code => ({ intel: { [Op.like]: `%"country":"${code}"%` } })) }];
    }
    return where;
};
const FLUSH_INTERVAL = 500;

const toText = body => (body ? Buffer.from(body).toString("base64") : null);

const summarise = row => ({
    id: row.id,
    time: new Date(row.time).getTime(),
    duration: row.duration,
    kind: row.kind,
    connection: row.connection,
    intel: row.intel ? JSON.parse(row.intel) : null,
    method: row.method,
    path: row.path,
    status: row.status,
    ip: row.ip,
    host: row.host,
    requestBytes: row.requestBytes,
    responseBytes: row.responseBytes,
});

const detail = row => ({
    ...summarise(row),
    request: {
        headers: JSON.parse(row.requestHeaders || "[]"),
        body: toText(row.requestBody),
        bytes: row.requestBytes,
        truncated: !!row.requestTruncated,
    },
    response: {
        headers: JSON.parse(row.responseHeaders || "[]"),
        body: toText(row.responseBody),
        bytes: row.responseBytes,
        truncated: !!row.responseTruncated,
    },
});

class TrafficLog {
    constructor({ limit = PER_TUNNEL_LIMIT, interval = FLUSH_INTERVAL } = {}) {
        this.limit = limit;
        this.interval = interval;
        this.pending = [];
        this.counts = new Map();
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

    record(tunnelId, entry) {
        this.pending.push({
            tunnel: tunnelId,
            time: new Date(entry.time),
            duration: entry.duration || 0,
            kind: entry.kind || "http",
            connection: entry.connection || null,
            intel: entry.intel ? JSON.stringify(entry.intel) : null,
            method: entry.method || null,
            path: entry.path || null,
            status: entry.status || null,
            ip: entry.ip || null,
            host: entry.host || null,
            requestHeaders: JSON.stringify(entry.request?.headers || []),
            requestBody: entry.request?.body || null,
            requestBytes: entry.request?.bytes || 0,
            requestTruncated: !!entry.request?.truncated,
            responseHeaders: JSON.stringify(entry.response?.headers || []),
            responseBody: entry.response?.body || null,
            responseBytes: entry.response?.bytes || 0,
            responseTruncated: !!entry.response?.truncated,
        });
        this.counts.set(tunnelId, (this.counts.get(tunnelId) || 0) + 1);
    }

    async flush() {
        if (!this.pending.length) return;
        const batch = this.pending;
        this.pending = [];

        try {
            await Request.bulkCreate(batch);
            for (const tunnel of new Set(batch.map(row => row.tunnel))) await this.prune(tunnel);
        } catch (err) {
            logger.warn(`Could not store ${batch.length} request(s): ${err.message}`);
        }
    }

    async prune(tunnel) {
        const rows = await Request.findAll({
            where: { tunnel }, order: [["id", "DESC"]], offset: this.limit, limit: 1, attributes: ["id"],
        });
        if (!rows.length) return;
        const stale = { tunnel, id: { [Op.lte]: rows[0].id } };
        const connections = (await Request.findAll({ where: { ...stale, connection: { [Op.ne]: null } }, attributes: ["connection"] })).map(row => row.connection);
        if (connections.length) await Frame.destroy({ where: { connection: connections } });
        await Request.destroy({ where: stale });
    }

    async finish(connection, duration) {
        const row = this.pending.find(entry => entry.connection === connection);
        if (row) row.duration = duration;
        else await Request.update({ duration }, { where: { connection } });
    }

    async list(tunnelId, { filter = {}, sort = "time", order = "desc", offset = 0, limit = PAGE_SIZE } = {}) {
        await this.flush();
        const column = SORTABLE[sort] || "id";
        const rows = await Request.findAll({
            where: criteria(tunnelId, filter),
            order: [[column, order === "asc" ? "ASC" : "DESC"], ["id", "DESC"]],
            offset: Math.max(offset, 0),
            limit: Math.min(Math.max(limit, 1), PER_TUNNEL_LIMIT),
            attributes: { exclude: ["requestBody", "responseBody", "requestHeaders", "responseHeaders"] },
        });
        return rows.map(summarise);
    }

    async all(tunnelId) {
        await this.flush();
        const rows = await Request.findAll({ where: { tunnel: tunnelId }, order: [["id", "ASC"]] });
        return rows.map(detail);
    }

    async get(tunnelId, id) {
        await this.flush();
        const row = await Request.findOne({ where: { tunnel: tunnelId, id } });
        return row ? detail(row) : null;
    }

    count(tunnelId, filter = {}) {
        return Request.count({ where: criteria(tunnelId, filter) });
    }

    async forget(tunnelId) {
        this.pending = this.pending.filter(row => row.tunnel !== tunnelId);
        this.counts.delete(tunnelId);
        await Frame.destroy({ where: { tunnel: tunnelId } });
        const removed = await Request.destroy({ where: { tunnel: tunnelId } });
        if (removed) logger.debug(`Dropped ${removed} stored request(s) for ${tunnelId}`);
    }
}

module.exports = { TrafficLog };
