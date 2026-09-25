const { Router } = require("../utils/router");

const app = Router();

app.get("/", async (req, res) => {
    res.json({ devices: await req.devices.list(req.session.role === "admin" ? undefined : req.account.id) });
});

app.post("/", async (req, res) => {
    const result = await req.devices.createKey(req.account.id, req.body.name);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.get("/pending/:code", (req, res) => {
    const request = req.devices.describe(req.params.code);
    if (!request) return res.status(404).json({ error: "not_found", message: "That code is unknown or has expired" });
    res.json({ request });
});

app.post("/pending/:code/approve", async (req, res) => {
    const result = await req.devices.approve(req.params.code, { name: req.body.name, accountId: req.account.id });
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.post("/pending/:code/deny", (req, res) => {
    const result = req.devices.deny(req.params.code);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const result = await req.devices.revoke(id, req.session.role === "admin" ? undefined : req.account.id);
    if (result.code) return res.status(result.code).json(result);
    req.registry.closeCredential(`device:${id}`, "device revoked");
    res.json(result);
});

module.exports = app;
