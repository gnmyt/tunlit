const { Op } = require("sequelize");
const Session = require("../models/Session");
const Account = require("../models/Account");

const COOKIE_NAME = "tunlit-admin";
const TTL = 7 * 24 * 60 * 60 * 1000;
const TOUCH_AFTER = 60_000;

class SessionStore {
    constructor() {
        this.sweeper = setInterval(() => this.sweep(), 60 * 60 * 1000);
        this.sweeper.unref();
    }

    async create(accountId, meta = {}) {
        const session = await Session.create({ accountId, ip: meta.ip || null, userAgent: meta.userAgent || null });
        return session.get ? session.get("token") : session.token;
    }

    async get(token) {
        if (!token) return null;
        const session = await Session.findOne({ where: { token: String(token) } });
        if (!session) return null;

        if (Date.now() - new Date(session.lastSeen).getTime() > TTL) {
            await Session.destroy({ where: { id: session.id } });
            return null;
        }

        const account = await Account.findByPk(session.accountId);
        if (!account) {
            await Session.destroy({ where: { id: session.id } });
            return null;
        }

        if (Date.now() - new Date(session.lastSeen).getTime() > TOUCH_AFTER) {
            await Session.update({ lastSeen: new Date() }, { where: { id: session.id } });
        }

        return { id: session.id, account, username: account.username, role: account.role, createdAt: session.createdAt };
    }

    remove(token) {
        return Session.destroy({ where: { token: String(token || "") } });
    }

    forAccount(accountId) {
        return Session.destroy({ where: { accountId } });
    }

    sweep() {
        return Session.destroy({ where: { lastSeen: { [Op.lt]: new Date(Date.now() - TTL) } } });
    }
}

const parseCookies = header => {
    const out = [];
    for (const part of String(header || "").split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;
        const name = part.slice(0, index).trim();
        if (name) out.push({ name, value: part.slice(index + 1).trim() });
    }
    return out;
};

const tokenFromRequest = req => parseCookies(req.headers.cookie).find(cookie => cookie.name === COOKIE_NAME)?.value || null;

const sessionCookie = (token, secure) =>
    `${COOKIE_NAME}=${token}; Path=/@tunlit; HttpOnly; SameSite=Lax; Max-Age=${TTL / 1000}${secure ? "; Secure" : ""}`;

const clearSessionCookie = secure =>
    `${COOKIE_NAME}=; Path=/@tunlit; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

module.exports = { SessionStore, tokenFromRequest, sessionCookie, clearSessionCookie };
