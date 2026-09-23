const persistent = require("../lib/persistent");

const usageFor = async (req, accountId) => ({
    tunnels: [...req.registry.tunnels.values()].filter(tunnel => tunnel.accountId === accountId).length,
    persistent: (await persistent.list(accountId)).length,
    domains: await req.domains.countFor(accountId),
    traffic: await req.quotas.trafficFor(accountId),
});

const mine = async req => ({
    defaults: req.quotas.defaults,
    limits: await req.quotas.limitsFor(req.account.id),
    usage: await usageFor(req, req.account.id),
});

const saveDefaults = async (req, input) => {
    try {
        return { message: "Limits saved", defaults: await req.quotas.saveDefaults(input) };
    } catch (err) {
        return { code: err.code === "bad_request" ? 400 : 500, message: err.message };
    }
};

module.exports = { usageFor, mine, saveDefaults };
