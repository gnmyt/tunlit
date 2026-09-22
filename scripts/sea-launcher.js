const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const Module = require("node:module");
const sea = require("node:sea");

if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const PAYLOAD_KEY = "app-payload.tar.gz";
const MANIFEST_KEY = "app-manifest.json";

const payload = Buffer.from(sea.getAsset(PAYLOAD_KEY));
const meta = JSON.parse(new TextDecoder().decode(sea.getAsset(MANIFEST_KEY)));

const fingerprint = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
const cacheRoot = path.join(os.tmpdir(), `tunlit-sea-${meta.version}-${fingerprint}`);
const appDir = path.join(cacheRoot, "app");
const readyMarker = path.join(cacheRoot, ".ready");

const extract = () => {
    const staging = `${cacheRoot}.tmp-${process.pid}`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });

    const tar = zlib.gunzipSync(payload);
    let offset = 0;
    while (offset < tar.length) {
        const header = tar.subarray(offset, offset + 512);
        offset += 512;
        const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
        if (!rawName) {
            if (offset >= tar.length || tar[offset] === 0) break;
            continue;
        }
        const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
        const name = prefix ? `${prefix}/${rawName}` : rawName;
        const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/[\0 ]+$/, "");
        const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
        const typeflag = String.fromCharCode(header[156]);
        const modeOctal = header.subarray(100, 108).toString("utf8").replace(/[\0 ]+$/, "");
        const mode = modeOctal ? parseInt(modeOctal, 8) : 0o644;
        const data = tar.subarray(offset, offset + size);
        offset += Math.ceil(size / 512) * 512;

        const target = path.join(staging, name);
        if (typeflag === "5") {
            fs.mkdirSync(target, { recursive: true });
        } else if (typeflag === "2") {
            const linkname = header.subarray(157, 257).toString("utf8").replace(/\0.*$/, "");
            fs.mkdirSync(path.dirname(target), { recursive: true });
            try { fs.symlinkSync(linkname, target); } catch { /* a link we cannot make is not fatal */ }
        } else {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, data, { mode });
        }
    }

    try {
        fs.renameSync(staging, cacheRoot);
    } catch (err) {
        if (err.code !== "ENOTEMPTY" && err.code !== "EEXIST") throw err;
        fs.rmSync(staging, { recursive: true, force: true });
    }
    fs.writeFileSync(readyMarker, "");
};

if (!fs.existsSync(readyMarker)) extract();

const appRequire = Module.createRequire(path.join(appDir, "package.json"));
appRequire(path.join(appDir, "server", "index.js"));
