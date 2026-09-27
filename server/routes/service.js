const { Router } = require("../utils/router");
const packageJson = require("../../package.json");
const { evaluate, cookieFor } = require("../lib/access");
const { verifyPassword } = require("../utils/password");
const { tokenFromRequest: sessionToken } = require("../lib/sessions");
const { classifyHost, QUERY_PARAM } = require("../lib/proxy");
const logger = require("../utils/logger");

const app = Router();

app.get("/info", (req, res) => {
    res.json({ name: "tunlit", version: packageJson.version, baseDomain: req.config.baseDomain, publicUrl: req.config.publicUrl });
});

app.get("/whoami", async (req, res) => {
    const device = req.config.ready ? await req.auth.deviceFor(req.auth.bearerFromHeaders(req.headers)) : null;
    if (!device) return res.status(401).json({ error: "unauthorized" });
    const account = await req.auth.accountFor(device);
    if (!account) return res.status(401).json({ error: "unauthorized" });
    res.json({ ok: true, role: "owner", username: account.username, guest: device.guest?.label ?? null });
});

app.get("/status/:id", (req, res) => {
    const tunnel = req.registry.get(String(req.params.id || "").toLowerCase());
    res.json({ exists: !!tunnel, online: !!tunnel && tunnel.online });
});

app.post("/gate/:id", async (req, res) => {
    const tunnel = req.registry.get(String(req.params.id || "").toLowerCase());
    if (!tunnel) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });

    const policy = tunnel.policy;
    if (evaluate(policy, req.info.clientIp, req.intel.lookup(req.info.clientIp))) {
        return res.status(403).json({ error: "forbidden", message: "Your address is not allowed to use this tunnel" });
    }
    if (policy.auth !== "password") return res.status(400).json({ error: "bad_request", message: "This tunnel does not use a password" });

    const key = `gate:${tunnel.id}:${req.info.clientIp}`;
    if (req.attempts.blocked(key)) {
        return res.status(429).json({ error: "too_many_attempts", message: "Too many attempts. Please try again later." });
    }

    if (!await verifyPassword(String(req.body.password || ""), policy.passwordHash)) {
        req.attempts.record(key);
        logger.warn(`Failed gate attempt for ${tunnel.id}`, { ip: req.info.clientIp });
        return res.status(401).json({ error: "unauthorized", message: "Wrong password" });
    }

    req.attempts.forget(key);
    const token = req.access.create(tunnel.id);
    res.header("Set-Cookie", cookieFor(token, req.info.secure)).json({ ok: true });
});

const redirect = (res, location) => res.raw.writeHead(302, { Location: location, "Cache-Control": "no-store" }).end();

const returnTarget = (req, tunnel, raw) => {
    const url = URL.parse(raw);
    if (!url || !["http:", "https:"].includes(url.protocol)) return null;
    const host = classifyHost(url.hostname, req.config.baseDomain);
    if (host.kind === "base") {
        url.searchParams.delete(QUERY_PARAM);
        return { url, to: `/@${tunnel.id}${url.pathname}${url.search}` };
    }
    const owner = host.kind === "subdomain" ? host.id : req.domains.tunnelFor(url.hostname);
    return owner === tunnel.id ? { url, to: `${url.pathname}${url.search}` } : null;
};

app.get("/gate/:id/authorize", async (req, res) => {
    const tunnel = req.registry.get(req.params.id.toLowerCase());
    if (!tunnel || tunnel.policy.auth !== "tunlit") return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    if (evaluate(tunnel.policy, req.info.clientIp, req.intel.lookup(req.info.clientIp))) {
        return res.status(403).json({ error: "forbidden", message: "Your address is not allowed to use this tunnel" });
    }
    const target = returnTarget(req, tunnel, req.query.get("return"));
    if (!target) return res.status(400).json({ error: "bad_request", message: "That return address does not belong to this tunnel" });

    if (!await req.sessions.get(sessionToken(req.raw))) return redirect(res, `/@tunlit/login?next=${encodeURIComponent(req.raw.url)}`);

    const code = req.access.issueCode(tunnel.id, target.url.hostname);
    redirect(res, `${target.url.origin}/@tunlit/gate?code=${code}&to=${encodeURIComponent(target.to)}`);
});

module.exports = app;
