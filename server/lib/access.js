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

const CATEGORIES = ["tor", "vpn", "datacenter", "blocklist"];
const CATEGORY_KEYS = { tor: "tor", vpn: "vpn", datacenter: "datacenter", blocklist: "blocklisted" };
const CATEGORY_LABELS = { tor: "Tor exit nodes", vpn: "VPN services", datacenter: "datacenters", blocklist: "blocklisted addresses" };

const fail = message => Object.assign(new Error(message), { code: "bad_request" });

const emptyPolicy = () => ({
    auth: "none",
    passwordHash: null,
    allow: { ips: [], countries: [] },
    block: { ips: [], countries: [], categories: [] },
});

const listOf = value => (Array.isArray(value) ? value : String(value).split(",")).map(entry => String(entry).trim()).filter(Boolean);

const ipRules = value => {
    const rules = listOf(value);
    for (const rule of rules) if (!parseRule(rule)) throw fail(`"${rule}" is not an IP address or CIDR range`);
    if (rules.length > 64) throw fail("At most 64 IP rules");
    return rules;
};

const countryCodes = value => {
    const codes = [...new Set(listOf(value).map(code => code.toUpperCase()))];
    for (const code of codes) if (!/^[A-Z]{2}$/.test(code)) throw fail(`"${code}" is not a country code`);
    return codes;
};

const categories = value => {
    const list = [...new Set(listOf(value).map(entry => entry.toLowerCase()))];
    for (const entry of list) if (!CATEGORIES.includes(entry)) throw fail(`"${entry}" is not one of ${CATEGORIES.join(", ")}`);
    return list;
};

const buildPolicy = (input = {}, previous = emptyPolicy()) => {
    const policy = { ...previous, allow: { ...previous.allow }, block: { ...previous.block } };

    if (input.allow?.ips !== undefined) policy.allow.ips = ipRules(input.allow.ips);
    if (input.allow?.countries !== undefined) policy.allow.countries = countryCodes(input.allow.countries);
    if (input.block?.ips !== undefined) policy.block.ips = ipRules(input.block.ips);
    if (input.block?.countries !== undefined) policy.block.countries = countryCodes(input.block.countries);
    if (input.block?.categories !== undefined) policy.block.categories = categories(input.block.categories);

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
    auth: policy.auth,
    hasPassword: !!policy.passwordHash,
    allow: policy.allow,
    block: policy.block,
});

const hasRules = policy => policy.allow.ips.length + policy.allow.countries.length + policy.block.ips.length + policy.block.countries.length + policy.block.categories.length > 0;

const isRestricted = (policy = emptyPolicy()) => policy.auth !== "none" || hasRules(policy);

const evaluate = (policy, ip, intel) => {
    if (!hasRules(policy)) return null;
    const { allow, block } = policy;
    if (block.ips.length && isAllowed(ip, block.ips)) return "address";
    if (block.countries.includes(intel.country)) return "country";
    const category = block.categories.find(entry => intel[CATEGORY_KEYS[entry]]);
    if (category) return category;
    if (allow.ips.length && !isAllowed(ip, allow.ips)) return "address";
    if (allow.countries.length && !allow.countries.includes(intel.country)) return "country";
    return null;
};

const summarizePolicy = policy => {
    const parts = [];
    if (policy.auth === "tunlit") parts.push("tunlit login required");
    if (policy.auth === "password") parts.push("password protected");
    if (policy.allow.ips.length) parts.push(`allowed: ${policy.allow.ips.join(", ")}`);
    if (policy.allow.countries.length) parts.push(`only ${policy.allow.countries.join(", ")}`);
    if (policy.block.ips.length) parts.push(`blocked: ${policy.block.ips.join(", ")}`);
    if (policy.block.countries.length) parts.push(`not ${policy.block.countries.join(", ")}`);
    if (policy.block.categories.length) parts.push(`no ${policy.block.categories.map(entry => CATEGORY_LABELS[entry]).join(", ")}`);
    return parts.join(" · ") || null;
};

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
    AccessStore, isAllowed, emptyPolicy, buildPolicy, describePolicy, summarizePolicy, isRestricted, evaluate,
    cookieFor, tokenFromRequest, basicCredentials,
};
