const { Router } = require("../utils/router");
const { getSetupStatus, completeSetup } = require("../controllers/setup");
const { sessionCookie } = require("../lib/sessions");

const app = Router();

app.get("/status", async (req, res) => {
    res.json(await getSetupStatus(req.config));
});

app.post("/complete", async (req, res) => {
    const result = await completeSetup(req.config, req.body);
    if (result.code) return res.status(result.code).json(result);
    const token = await req.sessions.create(result.account.id, { ip: req.info.clientIp, userAgent: req.headers["user-agent"] || "" });
    res.header("Set-Cookie", sessionCookie(token, req.info.secure)).json({ message: result.message });
});

module.exports = app;
