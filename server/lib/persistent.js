const TunnelModel = require("../models/Tunnel");
const Account = require("../models/Account");
const { emptyPolicy } = require("./access");

const toPolicy = row => ({ ...JSON.parse(row.rules), auth: row.auth, passwordHash: row.passwordHash || null });

const columns = policy => ({
    rules: JSON.stringify({ allow: policy.allow, block: policy.block }),
    auth: policy.auth,
    passwordHash: policy.passwordHash || null,
});

const toDefinition = row => ({
    name: row.name,
    accountId: row.accountId,
    policy: toPolicy(row),
    createdAt: row.createdAt,
});

const load = async name => {
    const row = await TunnelModel.findOne({ where: { name } });
    return row ? toDefinition(row) : null;
};

const list = async accountId => {
    const rows = await TunnelModel.findAll({ where: accountId ? { accountId } : {}, order: [["name", "ASC"]] });
    const accounts = await Account.findAll({ where: { id: [...new Set(rows.map(row => row.accountId))] }, attributes: ["id", "username"] });
    const names = new Map(accounts.map(account => [account.id, account.username]));
    return rows.map(row => ({ ...toDefinition(row), owner: names.get(row.accountId) || null }));
};

const create = async (name, accountId, policy = emptyPolicy()) => {
    if (await TunnelModel.findOne({ where: { name } })) {
        throw Object.assign(new Error(`"${name}" is already a persistent tunnel`), { code: "name_taken" });
    }
    await TunnelModel.create({ name, accountId, ...columns(policy) });
    return load(name);
};

const savePolicy = (name, policy) => TunnelModel.update(columns(policy), { where: { name } });

const remove = name => TunnelModel.destroy({ where: { name } });

module.exports = { load, list, create, savePolicy, remove };
