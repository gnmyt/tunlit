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
    const list = key => (req.query.get(key) || "").split(",").map(value => value.trim()).filter(Boolean);
    const filter = {
        search: (req.query.get("search") || "").trim().slice(0, 200),
        methods: list("methods").map(method => method.toUpperCase()),
        statuses: list("statuses").map(Number).filter(value => value >= 1 && value <= 5),
        countries: list("countries").map(code => code.toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code)),
    };
    const options = { filter, sort: req.query.get("sort") || "time", order: req.query.get("order") || "desc", offset: Number(req.query.get("offset")) || 0, limit: Number(req.query.get("limit")) || undefined };
    const [requests, total, countries] = await Promise.all([req.traffic.list(id, options), req.traffic.count(id, filter), req.traffic.countries(id)]);
    res.json({ requests, total, countries, now: Date.now() });
});

app.delete("/:id/requests", async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    await req.traffic.forget(id);
    res.json({ message: "Requests cleared" });
});

app.get("/:id/requests/:requestId/frames", async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    const entry = await req.traffic.get(id, Number(req.params.requestId));
    if (!entry?.connection) return res.status(404).json({ error: "not_found", message: "No frames for that request" });
    const after = Number(req.query.get("after")) || 0;
    res.json({ frames: await req.frames.list(id, entry.connection, after), open: req.frames.isOpen(entry.connection), now: Date.now() });
});

app.post("/:id/requests/:requestId/frames", async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!mayTouch(req.registry.get(id), req.session)) return res.status(404).json({ error: "not_found", message: "Tunnel not found" });
    const entry = await req.traffic.get(id, Number(req.params.requestId));
    if (!entry?.connection) return res.status(404).json({ error: "not_found", message: "No such connection" });
    const { direction, text } = req.body;
    if (!["in", "out"].includes(direction)) return res.status(400).json({ code: 400, message: "direction must be in or out" });
    if (typeof text !== "string" || !text) return res.status(400).json({ code: 400, message: "Nothing to send" });
    if (!req.frames.inject(id, entry.connection, direction, Buffer.from(text, "utf8"))) return res.status(409).json({ code: 409, message: "The connection is closed" });
    res.json({ message: "Sent" });
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
