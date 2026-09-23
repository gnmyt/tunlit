const { Router } = require("../utils/router");
const { listTunnels, closeTunnel, getTunnel, disconnectClient, disconnectAllClients, updateAccess, replay, mayTouch } = require("../controllers/tunnels");
const { toHar } = require("../lib/har");

const app = Router();

app.get("/", (req, res) => {
    res.json({ tunnels: listTunnels(req.registry, req.session), gracePeriod: req.config.gracePeriod, httpMode: req.config.httpMode, now: Date.now() });
});

app.get("/:id", async (req, res) => {
    const tunnel = await getTunnel(req.registry, req.traffic, req.params.id.toLowerCase(), req.session);
    if (!tunnel) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    res.json({ tunnel, gracePeriod: req.config.gracePeriod, now: Date.now() });
});

app.get("/:id/requests.har", async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    const rows = await req.traffic.all(id);
    const frames = await req.frames.forConnections(id, rows.filter(row => row.connection).map(row => row.connection));
    res.header("Content-Disposition", `attachment; filename="${id}.har"`).json(toHar(rows, req.config.publicScheme, frames));
});

app.get("/:id/requests", async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    const after = Number(req.query.get("after")) || 0;
    const before = Number(req.query.get("before")) || 0;
    const limit = Number(req.query.get("limit")) || undefined;
    const [requests, total] = await Promise.all([req.traffic.list(id, { after, before, limit }), req.traffic.count(id)]);
    res.json({ requests, total, now: Date.now() });
});

app.get("/:id/requests/:requestId/frames", async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    const entry = await req.traffic.get(id, Number(req.params.requestId));
    if (!entry?.connection) return res.status(404).json({ error: "not_found", message: "No frames for that request" });
    const after = Number(req.query.get("after")) || 0;
    res.json({ frames: await req.frames.list(id, entry.connection, after), open: req.frames.isOpen(entry.connection), now: Date.now() });
});

app.get("/:id/requests/:requestId", async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    const entry = await req.traffic.get(id, Number(req.params.requestId));
    if (!entry) return res.status(404).json({ error: "not_found", message: "That request is no longer stored" });
    res.json({ request: entry });
});

app.post("/:id/requests/:requestId/replay", async (req, res) => {
    const result = await replay(req, req.params.id.toLowerCase(), Number(req.params.requestId), req.body || {});
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.get("/:id/stats", (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    res.json({ stats: req.stats.read(id), now: Date.now() });
});

app.put("/:id/access", async (req, res) => {
    const result = await updateAccess(req.registry, req.access, req.params.id.toLowerCase(), req.body || {}, req.session);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.delete("/:id/clients", (req, res) => {
    const result = disconnectAllClients(req.registry, req.params.id.toLowerCase(), req.session);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.delete("/:id/clients/:clientId", (req, res) => {
    const result = disconnectClient(req.registry, req.params.id.toLowerCase(), req.params.clientId, req.session);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.delete("/:id", (req, res) => {
    const result = closeTunnel(req.registry, req.params.id.toLowerCase(), req.session);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

module.exports = app;
