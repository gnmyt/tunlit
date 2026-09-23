const dns = require("node:dns").promises;
const Domain = require("../models/Domain");
const logger = require("../utils/logger");

const RECHECK_INTERVAL = 5 * 60 * 1000;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
const UNSETTLED = ["pending", "issuing", "error"];

const normalize = hostname => String(hostname || "").trim().toLowerCase().replace(/\.$/, "");

const fail = (message, code) => Object.assign(new Error(message), { code });

class DomainManager {
    constructor({ config, certificates }) {
        this.config = config;
        this.certificates = certificates;
        this.byHost = new Map();
        this.checking = new Map();
        this.timer = null;
    }

    async load() {
        const rows = await Domain.findAll();
        this.byHost = new Map(rows.map(row => [row.hostname, row.tunnelName]));
    }

    start() {
        if (this.timer) return;
        const recheck = () => this.recheck().catch(err => logger.warn(`Domain check failed: ${err.message}`));
        this.timer = setInterval(recheck, RECHECK_INTERVAL);
        this.timer.unref();
        recheck();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    tunnelFor(hostname) {
        return this.byHost.get(hostname) || null;
    }

    hostsFor(tunnelName) {
        return [...this.byHost].filter(([, name]) => name === tunnelName).map(([hostname]) => hostname);
    }

    describe(row) {
        return {
            hostname: row.hostname,
            tunnel: row.tunnelName,
            state: row.state,
            error: row.lastError || null,
            checkedAt: row.checkedAt,
            createdAt: row.createdAt,
            url: `${this.config.publicScheme}://${row.hostname}`,
            certificate: this.certificates.info(row.hostname),
        };
    }

    validate(hostname) {
        const base = this.config.baseDomain;
        if (!HOSTNAME.test(hostname)) throw fail(`"${hostname}" is not a valid hostname`, "bad_request");
        if (hostname === base || hostname.endsWith(`.${base}`)) throw fail(`Names under ${base} are handled by the server itself`, "bad_request");
        return hostname;
    }

    async listFor(tunnelName) {
        const rows = await Domain.findAll({ where: { tunnelName }, order: [["hostname", "ASC"]] });
        return rows.map(row => this.describe(row));
    }

    async add(rawHostname, tunnelName, accountId) {
        const hostname = this.validate(normalize(rawHostname));
        if (this.byHost.has(hostname)) throw fail(`${hostname} is already in use`, "conflict");
        const row = await Domain.create({ hostname, tunnelName, accountId });
        this.byHost.set(hostname, tunnelName);
        logger.info(`Domain ${hostname} added for ${tunnelName}`);
        this.check(hostname).catch(err => logger.warn(`Domain check for ${hostname} failed: ${err.message}`));
        return this.describe(row);
    }

    async remove(hostname) {
        await Domain.destroy({ where: { hostname } });
        this.byHost.delete(hostname);
        await this.certificates.forget(hostname);
        logger.info(`Domain ${hostname} removed`);
    }

    async removeForTunnel(tunnelName) {
        for (const hostname of this.hostsFor(tunnelName)) await this.remove(hostname);
    }

    async recheck() {
        const rows = await Domain.findAll({ where: { state: UNSETTLED }, attributes: ["hostname"] });
        for (const row of rows) await this.check(row.hostname).catch(err => logger.warn(`Domain check for ${row.hostname} failed: ${err.message}`));
    }

    async pointsHere(hostname) {
        const base = this.config.baseDomain;
        const cnames = await dns.resolveCname(hostname).catch(() => []);
        if (cnames.some(target => normalize(target) === base)) return true;

        const addresses = async name => [
            ...await dns.resolve4(name).catch(() => []),
            ...await dns.resolve6(name).catch(() => []),
        ];
        const expected = new Set(await addresses(base));
        if (!expected.size) return false;
        return (await addresses(hostname)).some(address => expected.has(address));
    }

    check(hostname) {
        if (!this.byHost.has(hostname)) return Promise.resolve();
        if (!this.checking.has(hostname)) {
            this.checking.set(hostname, this.verify(hostname).finally(() => this.checking.delete(hostname)));
        }
        return this.checking.get(hostname);
    }

    async verify(hostname) {
        const update = (state, lastError = null) => Domain.update({ state, lastError, checkedAt: new Date() }, { where: { hostname } });
        try {
            if (!await this.pointsHere(hostname)) return await update("pending", `${hostname} does not point at ${this.config.baseDomain} yet`);
            if (!this.config.managesTls || !this.certificates.dueFor(hostname)) return await update("active");
            await update("issuing");
            await this.certificates.issueFor(hostname);
            await update("active");
        } catch (err) {
            await update("error", err.message);
        }
    }
}

module.exports = { DomainManager };
