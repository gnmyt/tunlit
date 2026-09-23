const { EventEmitter } = require("node:events");
const Account = require("../models/Account");
const Usage = require("../models/Usage");
const settings = require("./settings");
const logger = require("../utils/logger");

const KEYS = ["tunnels", "persistent", "domains", "traffic"];
const LABELS = { tunnels: "tunnels", persistent: "persistent tunnels", domains: "custom domains", traffic: "monthly traffic" };
const FLUSH_INTERVAL = 30 * 1000;

const month = () => new Date().toISOString().slice(0, 7);

const fail = (message, code) => Object.assign(new Error(message), { code });

const parseLimits = (input = {}, partial = false) => {
    const limits = {};
    for (const key of KEYS) {
        const raw = input[key];
        if (raw === undefined || raw === null || raw === "") {
            if (!partial) limits[key] = 0;
            continue;
        }
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0) throw fail(`${LABELS[key]} must be a whole number, 0 for no limit`, "bad_request");
        limits[key] = value;
    }
    return limits;
};

const NONE = parseLimits();

class Quotas extends EventEmitter {
    constructor() {
        super();
        this.defaults = NONE;
        this.pending = new Map();
        this.timer = null;
    }

    async load() {
        this.defaults = parseLimits((await settings.read()).quotas);
    }

    async saveDefaults(input) {
        this.defaults = parseLimits(input);
        await settings.write({ quotas: this.defaults });
        return this.defaults;
    }

    static parseOverride(input) {
        if (input === null) return null;
        const limits = parseLimits(input, true);
        return Object.keys(limits).length ? limits : null;
    }

    async limitsFor(accountId) {
        const account = await Account.findByPk(accountId, { attributes: ["role", "quotas"] });
        if (!account || account.role === "admin") return NONE;
        return { ...this.defaults, ...(account.quotas ? JSON.parse(account.quotas) : {}) };
    }

    async trafficFor(accountId) {
        const row = await Usage.findOne({ where: { accountId, month: month() } });
        return row ? Number(row.bytesIn) + Number(row.bytesOut) : 0;
    }

    async enforce(accountId, key, used) {
        const limit = (await this.limitsFor(accountId))[key];
        if (limit && used >= limit) throw fail(`Limit of ${limit} ${LABELS[key]} reached`, "quota_exceeded");
    }

    async enforceTraffic(accountId) {
        const limit = (await this.limitsFor(accountId)).traffic;
        if (limit && await this.trafficFor(accountId) >= limit) throw fail("Monthly traffic limit reached", "quota_exceeded");
    }

    record(accountId, bytesIn, bytesOut, requests) {
        if (!(bytesIn || bytesOut || requests)) return;
        const entry = this.pending.get(accountId) || { bytesIn: 0, bytesOut: 0, requests: 0 };
        entry.bytesIn += bytesIn;
        entry.bytesOut += bytesOut;
        entry.requests += requests;
        this.pending.set(accountId, entry);
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.flush().catch(err => logger.warn(`Could not store usage: ${err.message}`)), FLUSH_INTERVAL);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async flush() {
        const batch = this.pending;
        this.pending = new Map();
        const current = month();
        for (const [accountId, delta] of batch) {
            const [row] = await Usage.findOrCreate({ where: { accountId, month: current } });
            await Usage.increment(delta, { where: { id: row.id } });
            const limit = (await this.limitsFor(accountId)).traffic;
            if (limit && await this.trafficFor(accountId) >= limit) this.emit("exceeded", accountId);
        }
    }
}

module.exports = { Quotas };
