const Invite = require("../models/Invite");
const Account = require("../models/Account");
const { hashToken, randomToken } = require("../utils/ids");
const logger = require("../utils/logger");

const describe = (invite, owner) => ({
    id: invite.id,
    label: invite.label,
    owner: owner || null,
    createdAt: invite.createdAt,
    lastUsedAt: invite.lastUsedAt,
    uses: invite.uses,
});

const linkFor = (publicUrl, token) => `${publicUrl}/@tunlit/invite/${token}`;

const create = async (accountId, label) => {
    const name = String(label || "").trim();
    if (!name) return { code: 400, message: "Give the invite a label" };
    const token = randomToken(48);
    const invite = await Invite.create({ accountId, label: name, tokenHash: hashToken(token) });
    logger.info(`Invite "${name}" created`, { id: invite.id });
    return { invite: describe(invite), token };
};

const list = async accountId => {
    const where = accountId === undefined ? {} : { accountId };
    const invites = await Invite.findAll({ where, order: [["createdAt", "DESC"]] });
    if (accountId !== undefined) return invites.map(invite => describe(invite));
    const names = new Map((await Account.findAll()).map(account => [account.id, account.username]));
    return invites.map(invite => describe(invite, names.get(invite.accountId)));
};

const revoke = async (id, accountId) => {
    const where = accountId === undefined ? { id } : { id, accountId };
    const invite = await Invite.findOne({ where });
    if (!invite) return { code: 404, message: "Invite not found" };
    await Invite.destroy({ where: { id: invite.id } });
    logger.info(`Invite "${invite.label}" revoked`, { id });
    return { message: `${invite.label} revoked` };
};

const verify = token => (typeof token === "string" && token ? Invite.findOne({ where: { tokenHash: hashToken(token) } }) : null);

const used = async invite => {
    await Invite.update({ lastUsedAt: new Date(), uses: invite.uses + 1 }, { where: { id: invite.id } });
};

module.exports = { create, list, revoke, verify, used, linkFor };
