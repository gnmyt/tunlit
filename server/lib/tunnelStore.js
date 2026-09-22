const TunnelModel = require("../models/Tunnel");
const { emptyPolicy, isRestricted } = require("./access");

const toPolicy = row => {
    if (!row) return null;
    let allowedIps = [];
    try {
        const parsed = JSON.parse(row.allowedIps);
        if (Array.isArray(parsed)) allowedIps = parsed;
    } catch { /* a malformed row falls back to no rules */ }
    return { allowedIps, auth: row.auth, passwordHash: row.passwordHash || null };
};

const load = async name => {
    const row = await TunnelModel.findOne({ where: { name } });
    return row ? { accountId: row.accountId, policy: toPolicy(row) } : null;
};

const save = async (name, accountId, policy = emptyPolicy()) => {
    if (!isRestricted(policy)) return forget(name);
    const values = {
        name, accountId,
        allowedIps: JSON.stringify(policy.allowedIps || []),
        auth: policy.auth,
        passwordHash: policy.passwordHash || null,
    };
    const row = await TunnelModel.findOne({ where: { name } });
    if (row) return TunnelModel.update(values, { where: { id: row.id } });
    return TunnelModel.create(values);
};

const forget = name => TunnelModel.destroy({ where: { name } });

module.exports = { load, save, forget };
