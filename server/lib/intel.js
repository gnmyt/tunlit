const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { Reader } = require("mmdb-lib");
const { dataDir } = require("../utils/paths");
const logger = require("../utils/logger");

const DAY = 24 * 60 * 60 * 1000;
const LISTS = {
    tor: "https://check.torproject.org/torbulkexitlist",
    datacenter: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt",
    vpn: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt",
    blocklist: "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset",
};
const DATABASES = { country: "dbip-country-lite", asn: "dbip-asn-lite" };

const PRIVATE = [
    ["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], ["127.0.0.0", 8], ["169.254.0.0", 16], ["100.64.0.0", 10], ["0.0.0.0", 8],
].map(([base, bits]) => [ipv4(base) >>> 0, bits]);

function ipv4(text) {
    const parts = text.split(".");
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
        const octet = Number(part);
        if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
        value = value * 256 + octet;
    }
    return value;
}

const normalize = address => {
    const text = String(address || "").replace(/%.*$/, "").replace(/^\[|\]$/g, "");
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(text);
    return mapped ? mapped[1] : text;
};

const isPrivate = ip => {
    const value = ipv4(ip);
    if (value !== null) return PRIVATE.some(([base, bits]) => (value >>> (32 - bits)) === (base >>> (32 - bits)));
    return /^(::1$|fc|fd|fe80)/i.test(ip);
};

class RangeSet {
    constructor(lines) {
        this.ranges = [];
        for (const line of lines) {
            const text = line.trim();
            if (!text || text.startsWith("#")) continue;
            const [address, prefix = "32"] = text.split("/");
            const start = ipv4(address);
            const bits = Number(prefix);
            if (start === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
            const size = 2 ** (32 - bits);
            const from = Math.floor(start / size) * size;
            this.ranges.push([from, from + size - 1]);
        }
        this.ranges.sort((a, b) => a[0] - b[0]);
    }

    has(ip) {
        const value = ipv4(ip);
        if (value === null) return false;
        let low = 0;
        let high = this.ranges.length - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            const [from, to] = this.ranges[middle];
            if (value < from) high = middle - 1;
            else if (value > to) low = middle + 1;
            else return true;
        }
        return false;
    }
}

const months = () => {
    const now = new Date();
    const stamp = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return [stamp(now), stamp(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))];
};

class Intel {
    constructor() {
        this.dir = path.join(dataDir(), "intel");
        this.readers = {};
        this.lists = {};
        this.timer = null;
        this.updatedAt = {};
    }

    async load() {
        await fs.mkdir(this.dir, { recursive: true });
        for (const name of Object.keys(DATABASES)) await this.loadDatabase(name).catch(() => null);
        for (const name of Object.keys(LISTS)) await this.loadList(name).catch(() => null);
    }

    async loadDatabase(name) {
        const file = path.join(this.dir, `${name}.mmdb`);
        this.readers[name] = new Reader(await fs.readFile(file));
        this.updatedAt[name] = (await fs.stat(file)).mtime;
    }

    async loadList(name) {
        const file = path.join(this.dir, `${name}.txt`);
        this.lists[name] = new RangeSet((await fs.readFile(file, "utf8")).split("\n"));
        this.updatedAt[name] = (await fs.stat(file)).mtime;
    }

    start() {
        if (this.timer) return;
        const refresh = () => this.refresh().catch(err => logger.warn(`IP intelligence update failed: ${err.message}`));
        this.timer = setInterval(refresh, DAY);
        this.timer.unref();
        refresh();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    stale(name, maxAge) {
        return !this.updatedAt[name] || Date.now() - this.updatedAt[name].getTime() > maxAge;
    }

    async fetch(url) {
        const response = await globalThis.fetch(url, { headers: { "user-agent": "tunlit" } });
        if (!response.ok) throw new Error(`${url} answered ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
    }

    async refresh() {
        for (const [name, base] of Object.entries(DATABASES)) {
            if (!this.stale(name, 7 * DAY)) continue;
            for (const month of months()) {
                try {
                    const body = await this.fetch(`https://download.db-ip.com/free/${base}-${month}.mmdb.gz`);
                    await fs.writeFile(path.join(this.dir, `${name}.mmdb`), zlib.gunzipSync(body));
                    await this.loadDatabase(name);
                    logger.info(`IP intelligence: ${base} ${month} loaded`);
                    break;
                } catch (err) {
                    logger.debug(`IP intelligence: ${base} ${month} not available: ${err.message}`);
                }
            }
        }
        for (const [name, url] of Object.entries(LISTS)) {
            if (!this.stale(name, DAY)) continue;
            const body = await this.fetch(url);
            await fs.writeFile(path.join(this.dir, `${name}.txt`), body);
            await this.loadList(name);
        }
    }

    lookup(address) {
        const ip = normalize(address);
        if (isPrivate(ip)) return { ip, private: true };
        const valid = /^[0-9a-f.:]+$/i.test(ip);
        const country = valid ? this.readers.country?.get(ip) : null;
        const asn = valid ? this.readers.asn?.get(ip) : null;
        return {
            ip,
            private: false,
            country: country?.country?.iso_code || null,
            continent: country?.continent?.code || null,
            eu: !!country?.country?.is_in_european_union,
            asn: asn?.autonomous_system_number || null,
            org: asn?.autonomous_system_organization || null,
            tor: !!this.lists.tor?.has(ip),
            vpn: !!this.lists.vpn?.has(ip),
            datacenter: !!this.lists.datacenter?.has(ip),
            blocklisted: !!this.lists.blocklist?.has(ip),
        };
    }
}

module.exports = { Intel };
