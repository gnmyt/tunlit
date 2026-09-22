const { randomToken } = require("../utils/ids");
const { hashPassword } = require("../utils/password");

const COOKIE_NAME = "tunlit-access";
const TTL = 12 * 60 * 60 * 1000;
const AUTH_MODES = ["none", "password", "tunlit"];

const stripScope = address => String(address || "").replace(/%.*$/, "");

const toBytes = address => {
    const value = stripScope(address).replace(/^\[|\]$/g, "");
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
    const plain = mapped ? mapped[1] : value;

    if (/^\d+\.\d+\.\d+\.\d+$/.test(plain)) {
        const parts = plain.split(".").map(Number);
        if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
        return Buffer.from(parts);
    }
    if (!value.includes(":")) return null;

    const [head, tail = ""] = value.split("::");
    const expand = part => (part ? part.split(":").filter(Boolean) : []);
    const left = expand(head);
    const right = expand(tail);
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (missing > 0 && !value.includes("::"))) return null;
    const groups = [...left, ...Array(Math.max(missing, 0)).fill("0"), ...right];
    if (groups.length !== 8) return null;

    const bytes = Buffer.alloc(16);
    for (let i = 0; i < 8; i++) {
        const group = parseInt(groups[i], 16);
        if (Number.isNaN(group) || group < 0 || group > 0xffff) return null;
        bytes.writeUInt16BE(group, i * 2);
    }
    return bytes;
};

const parseRule = rule => {
    const text = String(rule || "").trim();
    if (!text) return null;
    const [address, prefix] = text.split("/");
    const bytes = toBytes(address);
    if (!bytes) return null;
    const bits = prefix === undefined ? bytes.length * 8 : Number(prefix);
    if (!Number.isInteger(bits) || bits < 0 || bits > bytes.length * 8) return null;
    return { bytes, bits, text };
};

const matchesRule = (address, rule) => {
    const bytes = toBytes(address);
    if (!bytes || bytes.length !== rule.bytes.length) return false;
    const whole = rule.bits >> 3;
    if (!bytes.subarray(0, whole).equals(rule.bytes.subarray(0, whole))) return false;
    const remainder = rule.bits & 7;
    if (!remainder) return true;
    const mask = 0xff << (8 - remainder) & 0xff;
    return (bytes[whole] & mask) === (rule.bytes[whole] & mask);
};

const isAllowed = (address, rules = []) => {
    if (!rules.length) return true;
    return rules.map(parseRule).filter(Boolean).some(rule => matchesRule(address, rule));
};

const emptyPolicy = () => ({ allowedIps: [], auth: "none", passwordHash: null });

const buildPolicy = (input = {}, previous = emptyPolicy()) => {
    const policy = { ...previous };

    if (input.allowedIps !== undefined) {
        const list = Array.isArray(input.allowedIps) ? input.allowedIps : String(input.allowedIps).split(",");
        const cleaned = list.map(entry => String(entry).trim()).filter(Boolean);
        for (const entry of cleaned) {
            if (!parseRule(entry)) throw Object.assign(new Error(`"${entry}" is not an IP address or CIDR range`), { code: "bad_request" });
        }
        if (cleaned.length > 64) throw Object.assign(new Error("At most 64 allowed IP rules"), { code: "bad_request" });
        policy.allowedIps = cleaned;
    }

    if (input.auth !== undefined) {
        const auth = String(input.auth || "none");
        if (!AUTH_MODES.includes(auth)) throw Object.assign(new Error(`auth must be one of ${AUTH_MODES.join(", ")}`), { code: "bad_request" });
        policy.auth = auth;
    }

    if (input.password) {
        const password = String(input.password);
        if (password.length < 4) throw Object.assign(new Error("The tunnel password must be at least 4 characters"), { code: "bad_request" });

        policy.passwordHash = hashPassword(password);
        if (input.auth === undefined) policy.auth = "password";
    }

    if (policy.auth === "password" && !policy.passwordHash) {
        throw Object.assign(new Error("Password protection needs a password"), { code: "bad_request" });
    }
    if (policy.auth !== "password") policy.passwordHash = null;
    return policy;
};

const describePolicy = (policy = emptyPolicy()) => ({
    allowedIps: policy.allowedIps,
    auth: policy.auth,
    hasPassword: !!policy.passwordHash,
});

const isRestricted = (policy = emptyPolicy()) => policy.auth !== "none" || policy.allowedIps.length > 0;

class AccessStore {
    constructor(ttl = TTL) {
        this.ttl = ttl;
        this.tokens = new Map();
        this.sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000);
        this.sweeper.unref();
    }

    create(tunnelId) {
        const token = randomToken(32);
        this.tokens.set(token, { tunnelId, expiresAt: Date.now() + this.ttl });
        return token;
    }

    allows(token, tunnelId) {
        const entry = token && this.tokens.get(token);
        if (!entry) return false;
        if (entry.expiresAt < Date.now()) {
            this.tokens.delete(token);
            return false;
        }
        return entry.tunnelId === tunnelId;
    }

    forget(tunnelId) {
        for (const [token, entry] of this.tokens) if (entry.tunnelId === tunnelId) this.tokens.delete(token);
    }

    sweep() {
        const now = Date.now();
        for (const [token, entry] of this.tokens) if (entry.expiresAt < now) this.tokens.delete(token);
    }
}

const cookieFor = (token, secure) =>
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TTL / 1000)}${secure ? "; Secure" : ""}`;

const tokenFromRequest = req => {
    for (const part of String(req.headers.cookie || "").split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;
        if (part.slice(0, index).trim() === COOKIE_NAME) return part.slice(index + 1).trim();
    }
    return null;
};

const basicCredentials = req => {
    const header = req.headers.authorization;
    const match = header && /^Basic\s+(.+)$/i.exec(header.trim());
    if (!match) return null;
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
};


module.exports = {
    AccessStore, isAllowed, emptyPolicy, buildPolicy, describePolicy, isRestricted,
    cookieFor, tokenFromRequest, basicCredentials,
};
