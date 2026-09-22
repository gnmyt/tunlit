const { Router } = require("../utils/router");
const store = require("../lib/tls/store");
const providers = require("../lib/tls/providers");
const logger = require("../utils/logger");

const app = Router();

const describeSettings = settings => ({
    email: settings.email,
    provider: settings.provider,
    hasCredential: !!settings.credential,
});

app.get("/", async (req, res) => {
    const settings = await store.settings();
    res.json({
        mode: req.config.tlsMode,
        wildcard: req.config.wildcard,
        httpsPort: req.config.httpsPort,
        redirectPort: req.config.redirectPort,
        providers: providers.describe(),
        acme: describeSettings(settings),
        status: req.certificates.status(),
    });
});

app.put("/", async (req, res) => {
    const { email, provider, credential } = req.body || {};
    const values = {};

    if (email !== undefined) {
        const trimmed = String(email || "").trim();
        if (trimmed && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
            return res.status(400).json({ code: 400, message: "That does not look like an email address" });
        }
        values.email = trimmed || null;
    }
    if (provider !== undefined) {
        if (!providers.get(provider)) return res.status(400).json({ code: 400, message: `Unknown DNS provider "${provider}"` });
        values.provider = provider;
    }
    if (credential !== undefined) values.credential = String(credential || "").trim() || null;

    if (!Object.keys(values).length) return res.status(400).json({ code: 400, message: "Nothing to change" });
    await store.saveSettings(values);
    logger.info(`${req.session.username} updated the certificate settings`, { provider: values.provider });
    res.json({ message: "Saved", acme: describeSettings(await store.settings()) });
});

app.post("/verify", async (req, res) => {
    const settings = await store.settings();
    const provider = providers.get(settings.provider);
    if (!provider?.verify) return res.status(400).json({ code: 400, message: "This provider has nothing to verify" });
    if (!settings.credential) return res.status(400).json({ code: 400, message: `${provider.title} needs an API token` });

    try {
        const result = await provider.verify(settings.credential, req.config.baseDomain);
        res.json(result);
    } catch (error) {
        res.status(502).json({ code: 502, message: error.message });
    }
});

app.post("/request", async (req, res) => {
    const result = await req.certificates.request();
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.post("/continue", (req, res) => {
    if (!req.certificates.continueManual()) {
        return res.status(409).json({ code: 409, message: "Nothing is waiting for a DNS record right now" });
    }
    res.json({ message: "Checking the record" });
});

app.get("/status", (req, res) => {
    res.json({ status: req.certificates.status() });
});

module.exports = app;
