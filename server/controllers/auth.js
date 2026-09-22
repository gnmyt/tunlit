const accounts = require("../lib/accounts");
const totp = require("../lib/totp");
const logger = require("../utils/logger");

module.exports.login = async (sessions, { username, password, code }, meta) => {
    if (!await accounts.count()) return { code: 409, message: "The server has not been set up yet" };

    const account = await accounts.checkCredentials({ username, password });
    if (!account) return { code: 401, message: "Username or password incorrect" };

    if (account.totpEnabled) {
        if (!code) return { code: 202, message: "This account asks for a code from your authenticator" };
        if (!totp.verify(account.totpSecret, code)) return { code: 401, message: "That code is not right or has expired" };
    }

    const token = await sessions.create(account.id, meta);
    logger.info(`${account.username} logged in`, { ip: meta.ip });
    return { token, username: account.username, role: account.role };
};

module.exports.checkAccountCredentials = async credentials => !!await accounts.checkCredentials(credentials);

module.exports.logout = (sessions, token) => sessions.remove(token);

module.exports.currentUser = session => ({
    id: session.account.id,
    username: session.username,
    role: session.role,
    totpEnabled: !!session.account.totpEnabled,
    createdAt: session.createdAt,
});
