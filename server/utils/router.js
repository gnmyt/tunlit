const { sendJson } = require("./html");

const MAX_BODY = 64 * 1024;

const readBody = req => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { reject(Object.assign(new Error("Request body too large"), { status: 413 })); req.destroy(); return; }
        chunks.push(chunk);
    });
    req.on("end", () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(Object.assign(new Error("Body must be valid JSON"), { status: 400 })); }
    });
    req.on("error", reject);
});

const compile = pattern => {
    const keys = [];
    const source = pattern.replace(/\/:([a-zA-Z]+)/g, (_, key) => { keys.push(key); return "/([^/]+)"; });
    return { regex: new RegExp(`^${source}/?$`), keys };
};

const Router = () => {
    const routes = [];
    const add = method => (pattern, ...handlers) => routes.push({ method, ...compile(pattern), handlers });
    return { routes, get: add("GET"), post: add("POST"), put: add("PUT"), patch: add("PATCH"), delete: add("DELETE") };
};

const createResponse = res => ({
    raw: res,
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    header(name, value) { this.headers[name] = value; return this; },
    json(data) { sendJson(res, this.statusCode, data, this.headers); },
});

const createApp = () => {
    const mounts = [];
    const app = {
        use: (prefix, ...args) => {
            const router = args.pop();
            mounts.push({ prefix, middlewares: args, router });
        },
        handle: async (req, res, pathname, context) => {
            const url = new URL(req.url, "http://tunlit.invalid");
            for (const mount of mounts) {
                if (pathname !== mount.prefix && !pathname.startsWith(`${mount.prefix}/`)) continue;
                const rest = pathname.slice(mount.prefix.length) || "/";
                for (const route of mount.router.routes) {
                    if (route.method !== req.method) continue;
                    const match = route.regex.exec(rest);
                    if (!match) continue;
                    const request = { raw: req, method: req.method, headers: req.headers, query: url.searchParams, params: Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])])), body: {}, ...context };
                    const response = createResponse(res);
                    try {
                        if (["POST", "PUT", "PATCH"].includes(req.method)) request.body = await readBody(req);
                        for (const handler of [...mount.middlewares, ...route.handlers]) {
                            let proceed = false;
                            await handler(request, response, () => { proceed = true; });
                            if (!proceed) return true;
                        }
                    } catch (err) {
                        if (!res.headersSent) sendJson(res, err.status || 500, { code: err.status || 500, message: err.status ? err.message : "Internal error" });
                        if (!err.status) throw err;
                    }
                    return true;
                }
            }
            return false;
        },
    };
    return app;
};

module.exports = { Router, createApp };
