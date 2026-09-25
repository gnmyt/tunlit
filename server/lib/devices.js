const crypto = require("node:crypto");
const Device = require("../models/Device");
const Account = require("../models/Account");
const { hashToken, randomToken } = require("../utils/ids");
const logger = require("../utils/logger");

const CODE_TTL = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const TOUCH_AFTER = 60_000;

const humanCode = () => {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
        if (i === 4) code += "-";
        code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return code;
};

const describeDevice = (device, owner) => ({
    id: device.id,
    name: device.name,
    kind: device.kind,
    owner: owner || null,
    createdAt: device.createdAt,
    lastUsedAt: device.lastUsedAt,
    ip: device.ip,
    userAgent: device.userAgent,
});

class DeviceStore {
    constructor() {
        this.pending = new Map();
        this.sweeper = setInterval(() => this.sweep(), 60_000);
        this.sweeper.unref();
    }

    sweep() {
        const now = Date.now();
        for (const [code, request] of this.pending) if (request.expiresAt < now) this.pending.delete(code);
    }

    createCode({ client = "cli", ip = "", userAgent = "" } = {}) {
        this.sweep();
        const code = humanCode();
        const pollToken = randomToken(32);
        const expiresAt = Date.now() + CODE_TTL;
        this.pending.set(code, { code, pollToken, client, ip, userAgent, createdAt: Date.now(), expiresAt, status: "pending", issued: null });
        logger.info(`Device code ${code} requested`, { ip, client });
        return { code, pollToken, expiresAt };
    }

    get(code) {
        this.sweep();
        return this.pending.get(String(code || "").toUpperCase().trim()) || null;
    }

    describe(code) {
        const request = this.get(code);
        if (!request) return null;
        return {
            code: request.code, client: request.client, ip: request.ip,
            userAgent: request.userAgent, createdAt: request.createdAt,
            expiresAt: request.expiresAt, status: request.status,
        };
    }

    async createKey(accountId, name) {
        const label = String(name || "").trim();
        if (!label) return { code: 400, message: "Give the key a name" };
        const token = randomToken(48);
        const device = await Device.create({ accountId, name: label, kind: "key", tokenHash: hashToken(token) });
        logger.info(`API key "${label}" created`, { id: device.id });
        return { device: describeDevice(device), token };
    }

    async approve(code, { name, accountId } = {}) {
        const request = this.get(code);
        if (!request) return { code: 404, message: "That code is unknown or has expired" };
        if (request.status !== "pending") return { code: 409, message: "That code was already used" };

        const token = randomToken(48);
        const device = await Device.create({
            accountId,
            name: String(name || "").trim() || request.client || "CLI",
            tokenHash: hashToken(token),
            ip: request.ip || null,
            userAgent: request.userAgent || null,
        });

        request.status = "authorized";
        request.issued = token;
        logger.info(`Device "${device.name}" authorized`, { id: device.id, ip: request.ip });
        return { device: describeDevice(device) };
    }

    deny(code) {
        const request = this.get(code);
        if (!request) return { code: 404, message: "That code is unknown or has expired" };
        this.pending.delete(request.code);
        logger.info(`Device code ${request.code} denied`);
        return { message: "Request denied" };
    }

    poll(pollToken) {
        this.sweep();
        for (const request of this.pending.values()) {
            if (request.pollToken !== pollToken) continue;
            if (request.status !== "authorized") return { status: "pending" };
            const token = request.issued;
            this.pending.delete(request.code);
            return { status: "authorized", token };
        }
        return { status: "invalid" };
    }

    async verify(token) {
        if (typeof token !== "string" || !token) return null;
        const device = await Device.findOne({ where: { tokenHash: hashToken(token) } });
        if (!device) return null;

        if (!device.lastUsedAt || Date.now() - new Date(device.lastUsedAt).getTime() > TOUCH_AFTER) {
            await Device.update({ lastUsedAt: new Date() }, { where: { id: device.id } });
        }
        return device;
    }

    async list(accountId) {
        const where = accountId === undefined ? {} : { accountId };
        const devices = await Device.findAll({ where, order: [["createdAt", "DESC"]] });
        if (accountId !== undefined) return devices.map(device => describeDevice(device));

        const accounts = await Account.findAll();
        const names = new Map(accounts.map(account => [account.id, account.username]));
        return devices.map(device => describeDevice(device, names.get(device.accountId)));
    }

    async revoke(id, accountId) {
        const where = accountId === undefined ? { id } : { id, accountId };
        const device = await Device.findOne({ where });
        if (!device) return { code: 404, message: "Device not found" };
        await Device.destroy({ where: { id: device.id } });
        logger.info(`Device "${device.name}" revoked`, { id });
        return { message: `${device.name} revoked` };
    }
}

module.exports = { DeviceStore };
