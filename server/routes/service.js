const { Router } = require("../utils/router");
const packageJson = require("../../package.json");
const { evaluate, cookieFor } = require("../lib/access");
const { verifyPassword } = require("../utils/password");
const { checkAccountCredentials } = require("../controllers/auth");
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
    if (policy.auth === "none") return res.json({ ok: true });

    const key = `gate:${tunnel.id}:${req.info.clientIp}`;
    if (req.attempts.blocked(key)) {
        return res.status(429).json({ error: "too_many_attempts", message: "Too many attempts. Please try again later." });
    }

    const accepted = policy.auth === "password"
        ? await verifyPassword(String(req.body.password || ""), policy.passwordHash)
        : await checkAccountCredentials({ username: req.body.username, password: req.body.password });
    if (!accepted) {
        req.attempts.record(key);
        logger.warn(`Failed gate attempt for ${tunnel.id}`, { ip: req.info.clientIp });
        return res.status(401).json({ error: "unauthorized", message: policy.auth === "password" ? "Wrong password" : "Username or password incorrect" });
    }

    req.attempts.forget(key);
    const token = req.access.create(tunnel.id);
    res.header("Set-Cookie", cookieFor(token, req.info.secure)).json({ ok: true });
});

module.exports = app;
