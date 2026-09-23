const { Router } = require("../utils/router");
const controller = require("../controllers/persistent");

const app = Router();

const reply = (res, result) => {
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
};

app.get("/", async (req, res) => {
    res.json({ tunnels: await controller.list(req), now: Date.now() });
});

app.post("/", async (req, res) => reply(res, await controller.create(req, req.body || {})));

app.get("/:name", async (req, res) => reply(res, await controller.get(req, req.params.name.toLowerCase())));

app.put("/:name/access", async (req, res) => reply(res, await controller.updateAccess(req, req.params.name.toLowerCase(), req.body || {})));

app.delete("/:name", async (req, res) => reply(res, await controller.remove(req, req.params.name.toLowerCase())));

app.post("/:name/domains", async (req, res) => reply(res, await controller.addDomain(req, req.params.name.toLowerCase(), req.body || {})));

app.post("/:name/domains/:hostname/check", async (req, res) => reply(res, await controller.checkDomain(req, req.params.name.toLowerCase(), req.params.hostname)));

app.delete("/:name/domains/:hostname", async (req, res) => reply(res, await controller.removeDomain(req, req.params.name.toLowerCase(), req.params.hostname)));

module.exports = app;
