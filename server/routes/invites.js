const { Router } = require("../utils/router");
const invites = require("../lib/invites");

const app = Router();

const scope = req => (req.session.role === "admin" ? undefined : req.account.id);

app.get("/", async (req, res) => {
    res.json({ invites: await invites.list(scope(req)) });
});

app.post("/", async (req, res) => {
    const result = await invites.create(req.account.id, req.body.label);
    if (result.code) return res.status(result.code).json(result);
    res.json({ invite: result.invite, link: invites.linkFor(req.config.publicUrl, result.token) });
});

app.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const result = await invites.revoke(id, scope(req));
    if (result.code) return res.status(result.code).json(result);
    req.registry.closeCredential(`invite:${id}`, "invite revoked");
    res.json(result);
});

module.exports = app;
