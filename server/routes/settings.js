const { Router } = require("../utils/router");
const { getSettings, updateSettings, changePassword } = require("../controllers/settings");
const { requireAdmin } = require("../middlewares/auth");

const app = Router();

app.get("/", (req, res) => {
    res.json(getSettings(req.config));
});

app.put("/", requireAdmin, async (req, res) => {
    const result = await updateSettings(req.config, req.body);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

app.put("/password", async (req, res) => {
    const result = await changePassword(req.account, req.body);
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

module.exports = app;
