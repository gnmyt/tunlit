const { Router } = require("../utils/router");
const oidc = require("../lib/oidc");
const logger = require("../utils/logger");

const app = Router();

const pick = body => {
    const values = {};
    for (const key of ["name", "issuer", "clientId", "scope", "usernameClaim"]) {
        if (body[key] !== undefined) values[key] = String(body[key]).trim();
    }
    if (body.clientSecret !== undefined && body.clientSecret !== "") values.clientSecret = String(body.clientSecret);
    for (const key of ["createAccounts", "enabled"]) {
        if (body[key] !== undefined) values[key] = body[key] === true || body[key] === "true";
    }
    return values;
};

app.get("/", async (req, res) => {
    res.json({ providers: await oidc.list(), redirectUri: oidc.redirectUri(req.config) });
});

app.post("/", async (req, res) => {
    const result = await oidc.save(null, pick(req.body || {}));
    if (result.code) return res.status(result.code).json(result);
    logger.info(`${req.session.username} added the login provider "${result.provider.name}"`);
    res.json({ message: `${result.provider.name} added`, provider: result.provider });
});

app.put("/:id", async (req, res) => {
    const result = await oidc.save(Number(req.params.id), pick(req.body || {}));
    if (result.code) return res.status(result.code).json(result);
    res.json({ message: "Saved", provider: result.provider });
});

app.delete("/:id", async (req, res) => {
    const result = await oidc.remove(Number(req.params.id));
    if (result.code) return res.status(result.code).json(result);
    logger.info(`${req.session.username} removed a login provider`);
    res.json(result);
});

module.exports = app;
