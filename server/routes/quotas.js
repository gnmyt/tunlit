const { Router } = require("../utils/router");
const { requireAdmin } = require("../middlewares/auth");
const { mine, saveDefaults } = require("../controllers/quotas");

const app = Router();

app.get("/", async (req, res) => res.json(await mine(req)));

app.put("/", requireAdmin, async (req, res) => {
    const result = await saveDefaults(req, req.body || {});
    if (result.code) return res.status(result.code).json(result);
    res.json(result);
});

module.exports = app;
