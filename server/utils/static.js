const fs = require("node:fs");
const path = require("node:path");

const DIST_DIR = path.join(__dirname, "..", "..", "client", "dist");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
};

const hasBuild = () => fs.existsSync(path.join(DIST_DIR, "index.html"));

let cached = null;
const readIndex = () => {
    const file = path.join(DIST_DIR, "index.html");
    if (!fs.existsSync(file)) return null;
    const stamp = fs.statSync(file).mtimeMs;
    if (!cached || cached.stamp !== stamp) cached = { stamp, html: fs.readFileSync(file, "utf8") };
    return cached.html;
};

const sendFile = (req, res, relative) => {
    const file = path.normalize(path.join(DIST_DIR, relative));
    if (!file.startsWith(DIST_DIR + path.sep)) return false;
    let stats;
    try {
        stats = fs.statSync(file);
    } catch {
        return false;
    }
    if (!stats.isFile()) return false;
    const immutable = relative.startsWith("assets/");
    res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": stats.size,
        "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") return res.end(), true;
    fs.createReadStream(file).pipe(res);
    return true;
};

const MISSING_BUILD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>tunlit</title></head><body style="font-family:system-ui;background:#000A12;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><main style="max-width:32rem;text-align:center"><h1>Web UI not built</h1><p style="color:#B7B7B7">Run <code>npm run build</code> in <code>client/</code> (or use <code>npm run dev</code> for the Vite dev server) and reload.</p></main></body></html>`;

const sendIndex = (req, res) => {
    if (sendFile(req, res, "index.html")) return;
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(MISSING_BUILD);
};

module.exports = { hasBuild, readIndex, sendFile, sendIndex };
