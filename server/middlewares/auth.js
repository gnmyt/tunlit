const { tokenFromRequest } = require("../lib/sessions");
const { isSetupRequired } = require("../controllers/setup");

module.exports.authenticate = async (req, res, next) => {
    const token = tokenFromRequest(req.raw);
    const session = await req.sessions.get(token);
    if (!session) return res.status(401).json({ code: 401, message: "You need to be logged in" });
    req.session = session;
    req.account = session.account;
    req.sessionToken = token;
    next();
};

module.exports.requireAdmin = (req, res, next) => {
    if (req.session.role !== "admin") return res.status(403).json({ code: 403, message: "Only an admin can do that" });
    next();
};

module.exports.requireSetupComplete = async (req, res, next) => {
    if (await isSetupRequired()) return res.status(409).json({ code: 409, message: "The server has not been set up yet" });
    next();
};
