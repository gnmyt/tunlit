const { Router } = require("../utils/router");
const accounts = require("../lib/accounts");
const logger = require("../utils/logger");

const app = Router();

app.get("/", async (req, res) => {
    res.json({ accounts: await accounts.list() });
});

app.post("/", async (req, res) => {
    const result = await accounts.create({ username: req.body.username, password: req.body.password, role: req.body.role });
    if (result.code) return res.status(result.code).json(result);
    logger.info(`${req.session.username} created the account "${result.account.username}"`);
    res.json({ message: `${result.account.username} created`, account: result.account });
});

app.put("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.account.id && req.body.role !== undefined && req.body.role !== req.session.role) {
        return res.status(409).json({ code: 409, message: "You cannot change your own role" });
    }
    const result = await accounts.update(id, { role: req.body.role, password: req.body.password });
    if (result.code) return res.status(result.code).json(result);
    logger.info(`${req.session.username} updated the account "${result.account.username}"`);
    res.json({ message: `${result.account.username} updated`, account: result.account });
});

app.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.account.id) return res.status(409).json({ code: 409, message: "You cannot delete your own account" });
    const result = await accounts.remove(id);
    if (result.code) return res.status(result.code).json(result);
    logger.info(`${req.session.username} deleted an account`, { id });
    res.json(result);
});

module.exports = app;
