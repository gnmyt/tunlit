const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");
const ids = require("../utils/ids");
const { emptyPolicy, buildPolicy, evaluate } = require("./access");
const persistent = require("./persistent");
const { safeEqual } = require("../utils/auth");
const logger = require("../utils/logger");

const endSession = (session, reason, code = 4003) => {
    if (!session || session.closed) return;
    session.sendControl({ type: "bye", reason });
    session.close(code, reason);
};

class Tunnel {
    constructor({ id, mode, target, keepHost, accountId, owner }) {
        this.id = id;
        this.accountId = accountId || null;
        this.owner = owner || null;
        this.mode = mode;
        this.target = target;
        this.keepHost = !!keepHost;
        this.session = null;
        this.resumeToken = ids.randomToken(32);
        this.secret = mode === "tcp" ? ids.randomSecret() : null;
        this.secretHash = this.secret ? ids.hashSecret(this.secret) : null;
        this.joiners = new Set();
        this.graceTimer = null;
        this.graceUntil = null;
        this.createdAt = Date.now();
        this.policy = emptyPolicy();
        this.persistent = false;
    }

    get online() {
        return !!this.session && !this.session.closed;
    }

    get shareCode() {
        return this.secret ? `${this.id}${this.secret}` : null;
    }
}

const parseTarget = raw => {
    if (typeof raw !== "string") return null;
    let value = raw.trim();
    if (/^\d+$/.test(value)) value = `127.0.0.1:${value}`;
    const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(value);
    if (!match) return null;
    const port = Number(match[2]);
    if (port < 1 || port > 65535) return null;
    const host = match[1];
    return { host, port, authority: `${host}:${port}` };
};

class Registry extends EventEmitter {
    constructor(config, domains, quotas, intel) {
        super();
        this.config = config;
        this.domains = domains;
        this.quotas = quotas;
        this.intel = intel;
        this.tunnels = new Map();
    }

    get(id) {
        return this.tunnels.get(id) || null;
    }

    async _allocateId(requested, account) {
        if (requested !== undefined && requested !== null && requested !== "") {
            const name = String(requested).toLowerCase();
            if (ids.isReserved(name)) throw Object.assign(new Error(`The name "${name}" is taken by the server itself`), { code: "invalid_name" });
            if (!ids.isValidName(name)) throw Object.assign(new Error(`Invalid name "${name}": use 3-32 characters a-z, 0-9 or "-"`), { code: "invalid_name" });
            if (this.tunnels.has(name)) throw Object.assign(new Error(`The name "${name}" is already in use`), { code: "name_taken" });
            const definition = await persistent.load(name);
            if (definition && definition.accountId !== account.id) {
                throw Object.assign(new Error(`The name "${name}" is reserved by another account`), { code: "name_reserved" });
            }
            return { id: name, definition };
        }
        for (let i = 0; i < 50; i++) {
            const id = ids.randomId(6);
            if (!this.tunnels.has(id) && !ids.isReserved(id) && !await persistent.load(id)) return { id, definition: null };
        }
        throw Object.assign(new Error("Could not allocate a tunnel id"), { code: "bad_request" });
    }

    async register(session, { mode, target, name, keepHost, resume, policy, share }) {
        if (!["http", "tcp"].includes(mode)) throw Object.assign(new Error("mode must be http or tcp"), { code: "bad_request" });

        mode = mode === "http" ? this.config.httpMode : "tcp";
        const parsedTarget = parseTarget(target);
        if (!parsedTarget) throw Object.assign(new Error("target must be a port or host:port"), { code: "bad_request" });

        const account = session.account || {};

        if (typeof resume === "string" && resume.length) {
            const existing = this._findByResumeToken(resume);
            if (existing && existing.mode === mode && existing.accountId === account.id) {
                if (policy) {
                    existing.policy = buildPolicy(policy);
                    if (existing.persistent) await persistent.savePolicy(existing.id, existing.policy);
                }
                this._attach(existing, session, parsedTarget, keepHost);
                logger.info(`Tunnel ${existing.id} resumed`, { mode });
                return { tunnel: existing, resumed: true };
            }
        }

        const owned = [...this.tunnels.values()].filter(tunnel => tunnel.accountId === account.id).length;
        await this.quotas.enforce(account.id, "tunnels", owned);
        await this.quotas.enforceTraffic(account.id);

        const previous = mode === "tcp" ? ids.splitShareCode(share) : null;
        const wanted = name || (previous && !this.tunnels.has(previous.id) ? previous.id : undefined);
        const { id, definition } = await this._allocateId(wanted, account);
        const tunnel = new Tunnel({ id, mode, target: parsedTarget, keepHost, accountId: account.id, owner: account.username });
        if (previous && previous.id === id) {
            tunnel.secret = previous.secret;
            tunnel.secretHash = ids.hashSecret(previous.secret);
        }

        if (definition) {
            tunnel.persistent = true;
            tunnel.policy = definition.policy;
        }
        if (policy) {
            tunnel.policy = buildPolicy(policy);
            if (definition) await persistent.savePolicy(id, tunnel.policy);
        }

        this.tunnels.set(id, tunnel);
        this._attach(tunnel, session, parsedTarget, keepHost);
        logger.info(`Tunnel ${id} registered`, { mode, target: parsedTarget.authority, owner: account.username });
        return { tunnel, resumed: false };
    }

    _findByResumeToken(token) {
        for (const tunnel of this.tunnels.values()) {
            if (safeEqual(tunnel.resumeToken, token)) return tunnel;
        }
        return null;
    }

    _attach(tunnel, session, target, keepHost) {
        if (tunnel.graceTimer) {
            clearTimeout(tunnel.graceTimer);
            tunnel.graceTimer = null;
        }
        tunnel.graceUntil = null;
        if (tunnel.session && tunnel.session !== session && !tunnel.session.closed) {
            endSession(tunnel.session, "replaced by a newer connection", 4001);
        }
        tunnel.session = session;
        tunnel.target = target;
        tunnel.keepHost = !!keepHost;
        session.tunnel = tunnel;
        session.once("close", () => {
            if (tunnel.session !== session) return;
            tunnel.session = null;
            if (session.saidBye) return this.remove(tunnel.id, "closed by owner");
            this._startGrace(tunnel);
        });
        this.emit("online", tunnel);
    }

    _startGrace(tunnel) {
        const seconds = this.config.gracePeriod;
        logger.info(`Tunnel ${tunnel.id} offline, reserved for ${seconds}s`);
        this.emit("offline", tunnel);
        if (seconds <= 0) return this.remove(tunnel.id, "grace period is 0");
        tunnel.graceUntil = Date.now() + seconds * 1000;
        tunnel.graceTimer = setTimeout(() => this.remove(tunnel.id, "grace period expired"), seconds * 1000);
    }

    remove(id, reason) {
        const tunnel = this.tunnels.get(id);
        if (!tunnel) return;
        this.emit("forget", tunnel);
        this.tunnels.delete(id);
        if (tunnel.graceTimer) clearTimeout(tunnel.graceTimer);
        endSession(tunnel.session, `tunnel closed (${reason})`, 4004);
        for (const joiner of tunnel.joiners) endSession(joiner, "tunnel closed", 4004);
        tunnel.joiners.clear();
        logger.info(`Tunnel ${id} removed`, { reason });
        this.emit("removed", tunnel);
    }

    closeFor(accountId, reason) {
        for (const tunnel of [...this.tunnels.values()]) {
            if (tunnel.accountId === accountId) this.remove(tunnel.id, reason);
        }
    }

    join(session, code) {
        const parts = ids.splitShareCode(code);
        if (!parts) throw Object.assign(new Error("Invalid share code"), { code: "invalid_code" });
        const tunnel = this.tunnels.get(parts.id);
        if (!tunnel || tunnel.mode !== "tcp" || !tunnel.secretHash) throw Object.assign(new Error("Invalid share code"), { code: "invalid_code" });
        if (!crypto.timingSafeEqual(tunnel.secretHash, ids.hashSecret(parts.secret))) throw Object.assign(new Error("Invalid share code"), { code: "invalid_code" });
        const ip = session.client?.ip;
        const details = this.intel.lookup(ip);
        const reason = evaluate(tunnel.policy, ip, details);
        if (reason) {
            this.emit("blocked", tunnel, ip, details, reason);
            throw Object.assign(new Error("Your address is not allowed to use this tunnel"), { code: "forbidden" });
        }
        tunnel.joiners.add(session);
        session.tunnel = tunnel;
        session.once("close", () => tunnel.joiners.delete(session));
        return tunnel;
    }

    connectUrl(tunnel) {
        return tunnel.shareCode ? `${this.config.publicUrl}/@tunlit/connect/${tunnel.shareCode}` : null;
    }

    publicUrl(tunnel) {
        return tunnel.mode === "tcp" ? null : this.urlFor(tunnel.id, tunnel.mode);
    }

    urlFor(name, mode = this.config.httpMode) {
        const { publicScheme, baseDomain, publicUrl } = this.config;
        if (mode === "subdomain") {
            const port = new URL(publicUrl).port;
            return `${publicScheme}://${name}.${baseDomain}${port ? `:${port}` : ""}`;
        }
        return `${publicUrl}/@${name}`;
    }

    customUrls(tunnel) {
        if (tunnel.mode === "tcp") return [];
        return this.domains.hostsFor(tunnel.id).map(hostname => `${this.config.publicScheme}://${hostname}`);
    }
}

module.exports = { Registry, endSession };
