const speakeasy = require("speakeasy");
const Account = require("../models/Account");
const Session = require("../models/Session");
const logger = require("../utils/logger");

const WINDOW = 1;

const secretFor = async account => {
    if (account.totpSecret) return account.totpSecret;
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    await Account.update({ totpSecret: secret }, { where: { id: account.id } });
    return secret;
};

const otpauthUrl = (secret, username, issuer) =>
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

const verify = (secret, code) => speakeasy.totp.verify({
    secret: secret || "",
    encoding: "base32",
    token: String(code || "").replace(/\s/g, ""),
    window: WINDOW,
});

const begin = async (account, issuer) => {
    if (account.totpEnabled) return { code: 409, message: "Two-factor is already on for this account" };
    const secret = await secretFor(account);
    return { secret, url: otpauthUrl(secret, account.username, issuer) };
};

const enable = async (account, code) => {
    if (account.totpEnabled) return { code: 409, message: "Two-factor is already on for this account" };
    if (!account.totpSecret) return { code: 409, message: "Start the setup first" };
    if (!verify(account.totpSecret, code)) return { code: 401, message: "That code is not right. Check your clock and try the next one." };

    await Account.update({ totpEnabled: true }, { where: { id: account.id } });
    await Session.destroy({ where: { accountId: account.id } });
    logger.info(`${account.username} turned on two-factor`);
    return { message: "Two-factor is on" };
};

const disable = async (account, code) => {
    if (!account.totpEnabled) return { code: 409, message: "Two-factor is already off" };
    if (!verify(account.totpSecret, code)) return { code: 401, message: "That code is not right" };

    await Account.update({ totpEnabled: false, totpSecret: null }, { where: { id: account.id } });
    logger.info(`${account.username} turned off two-factor`);
    return { message: "Two-factor is off" };
};

module.exports = { begin, enable, disable, verify };
