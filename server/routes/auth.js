const { Router } = require("../utils/router");
const { login, logout, currentUser } = require("../controllers/auth");
const { authenticate, requireSetupComplete } = require("../middlewares/auth");
const { sessionCookie, clearSessionCookie } = require("../lib/sessions");
const passkeys = require("../lib/passkeys");
const oidc = require("../lib/oidc");
const totp = require("../lib/totp");

const app = Router();

const originOf = req => `${req.info.proto}://${req.info.host}`;

const signIn = async (req, res, account, extra = {}) => {
    const token = await req.sessions.create(account.id, {
        ip: req.info.clientIp, userAgent: req.headers["user-agent"] || "",
    });
    res.header("Set-Cookie", sessionCookie(token, req.info.secure))
        .json({ username: account.username, role: account.role, message: "Logged in", ...extra });
};

app.post("/login", requireSetupComplete, async (req, res) => {
    const key = `login:${req.info.clientIp}`;
    if (req.attempts.blocked(key)) return res.status(429).json({ code: 429, message: "Too many login attempts. Please try again later." });

    const result = await login(req.sessions, req.body, { ip: req.info.clientIp, userAgent: req.headers["user-agent"] || "" });
    if (result.code) {
        if (result.code === 401) req.attempts.record(key);
        if (result.code === 202) return res.status(202).json({ totpRequired: true, message: result.message });
        return res.status(result.code).json(result);
    }

    req.attempts.forget(key);
    res.header("Set-Cookie", sessionCookie(result.token, req.info.secure))
        .json({ username: result.username, role: result.role, message: "Logged in" });
});

app.post("/logout", authenticate, async (req, res) => {
    await logout(req.sessions, req.sessionToken);
    res.header("Set-Cookie", clearSessionCookie(req.info.secure)).json({ message: "Logged out" });
});

app.get("/me", authenticate, (req, res) => {
    res.json(currentUser(req.session));
});

app.post("/device/create", (req, res) => {
    const key = `device:${req.info.clientIp}`;
    if (req.attempts.blocked(key)) return res.status(429).json({ code: 429, message: "Too many device codes requested. Please try again later." });
    req.attempts.record(key);

    const { code, pollToken, expiresAt } = req.devices.createCode({
        client: String(req.body.client || "cli").slice(0, 40),
        ip: req.info.clientIp,
        userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    });
    res.json({ code, pollToken, expiresAt, handoffUrl: `${req.config.publicUrl || ""}/@tunlit/handoff?code=${encodeURIComponent(code)}` });
});

app.post("/device/poll", (req, res) => {
    res.json(req.devices.poll(String(req.body.pollToken || "")));
});

app.get("/providers", async (req, res) => {
    res.json({ providers: await oidc.enabled() });
});

app.post("/oidc/:id/start", async (req, res) => {
    const result = await oidc.begin(Number(req.params.id), req.config);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.get("/oidc/callback", async (req, res) => {
    const query = Object.fromEntries(req.query);
    const result = await oidc.complete(query, req.config);
    const target = `${req.config.publicUrl}/@tunlit/`;

    if (result.code) {
        return res.raw.writeHead(302, {
            Location: `${target}login?error=${encodeURIComponent(result.message)}`,
            "Cache-Control": "no-store",
        }).end();
    }

    const token = await req.sessions.create(result.account.id, {
        ip: req.info.clientIp, userAgent: req.headers["user-agent"] || "",
    });
    res.raw.writeHead(302, {
        Location: target,
        "Set-Cookie": sessionCookie(token, req.info.secure),
        "Cache-Control": "no-store",
    }).end();
});

app.post("/passkey/options", async (req, res) => {
    res.json(await passkeys.startAuthentication(req.body.username, originOf(req)));
});

app.post("/passkey/verify", async (req, res) => {
    const key = `passkey:${req.info.clientIp}`;
    if (req.attempts.blocked(key)) return res.status(429).json({ code: 429, message: "Too many attempts. Please try again later." });

    const result = await passkeys.finishAuthentication(req.body.response, originOf(req));
    if (result.code) {
        req.attempts.record(key);
        return res.status(result.code).json(result);
    }
    req.attempts.forget(key);
    await signIn(req, res, result.account);
});

app.get("/totp/setup", authenticate, async (req, res) => {
    const result = await totp.begin(req.account, req.config.baseDomain || "tunlit");
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.post("/totp/enable", authenticate, async (req, res) => {
    const result = await totp.enable(req.account, req.body.code);
    if (result.code) return res.status(result.code).json(result);
    res.header("Set-Cookie", clearSessionCookie(req.info.secure)).json(result);
});

app.post("/totp/disable", authenticate, async (req, res) => {
    const result = await totp.disable(req.account, req.body.code);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.get("/passkeys", authenticate, async (req, res) => {
    res.json({ passkeys: await passkeys.list(req.account.id) });
});

app.post("/passkeys/options", authenticate, async (req, res) => {
    res.json(await passkeys.startRegistration(req.account, originOf(req)));
});

app.post("/passkeys", authenticate, async (req, res) => {
    const result = await passkeys.finishRegistration(req.account, req.body.response, req.body.name, originOf(req));
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.delete("/passkeys/:id", authenticate, async (req, res) => {
    const result = await passkeys.remove(req.account.id, Number(req.params.id));
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

module.exports = app;
