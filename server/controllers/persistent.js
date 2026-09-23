const persistent = require("../lib/persistent");
const { buildPolicy, describePolicy, emptyPolicy } = require("../lib/access");
const { announceAccess } = require("./tunnels");
const ids = require("../utils/ids");

const NOT_FOUND = { code: 404, message: "Persistent tunnel not found" };

const isAdmin = viewer => viewer.role === "admin";

const policyFrom = (input, previous) => {
    try {
        return { policy: buildPolicy({ ...input, password: input.password || undefined }, previous) };
    } catch (err) {
        return { code: err.code === "bad_request" ? 400 : 500, message: err.message };
    }
};

const applyLive = (req, name, policy) => {
    const live = req.registry.get(name);
    if (!live) return;
    live.policy = policy;
    req.access.forget(name);
    announceAccess(live);
};

const serialize = async (req, definition) => {
    const live = req.registry.get(definition.name);
    return {
        name: definition.name,
        owner: definition.owner,
        accountId: definition.accountId,
        access: describePolicy(definition.policy),
        createdAt: definition.createdAt,
        online: !!live?.online,
        live: !!live,
        url: req.registry.urlFor(definition.name),
        domains: await req.domains.listFor(definition.name),
    };
};

const definitionFor = async (req, name) => {
    const definition = await persistent.load(name);
    if (!definition || (!isAdmin(req.session) && definition.accountId !== req.session.account.id)) return null;
    return definition;
};

const domainOf = async (req, name, hostname) => {
    if (!await definitionFor(req, name)) return null;
    const normalized = String(hostname || "").trim().toLowerCase();
    return req.domains.tunnelFor(normalized) === name ? normalized : null;
};

module.exports.list = async req => {
    const definitions = await persistent.list(isAdmin(req.session) ? null : req.session.account.id);
    return Promise.all(definitions.map(definition => serialize(req, definition)));
};

module.exports.get = async (req, name) => {
    const definition = await definitionFor(req, name);
    if (!definition) return NOT_FOUND;
    return { tunnel: await serialize(req, definition) };
};

module.exports.create = async (req, input) => {
    const name = String(input.name || "").trim().toLowerCase();
    if (!ids.isValidName(name)) return { code: 400, message: "Use 3-32 characters a-z, 0-9 or \"-\" for the name" };

    const live = req.registry.get(name);
    if (live && live.accountId !== req.session.account.id && !isAdmin(req.session)) {
        return { code: 409, message: `"${name}" is in use by another account` };
    }

    const wantsPolicy = ["auth", "password", "allow", "block"].some(key => input[key] !== undefined);
    const { policy, code, message } = wantsPolicy ? policyFrom(input, live ? live.policy : emptyPolicy()) : { policy: live ? live.policy : emptyPolicy() };
    if (code) return { code, message };

    const accountId = live ? live.accountId : req.session.account.id;
    let definition;
    try {
        await req.quotas.enforce(accountId, "persistent", (await persistent.list(accountId)).length);
        definition = await persistent.create(name, accountId, policy);
    } catch (err) {
        return { code: { name_taken: 409, quota_exceeded: 429 }[err.code] || 500, message: err.message };
    }
    definition.owner = live ? live.owner : req.session.account.username;
    if (live) {
        live.persistent = true;
        applyLive(req, name, policy);
    }
    return { message: `${name} is now persistent`, tunnel: await serialize(req, definition) };
};

module.exports.updateAccess = async (req, name, input) => {
    const definition = await definitionFor(req, name);
    if (!definition) return NOT_FOUND;
    const { policy, code, message } = policyFrom(input, definition.policy);
    if (code) return { code, message };
    await persistent.savePolicy(name, policy);
    applyLive(req, name, policy);
    return { message: "Access updated", access: describePolicy(policy) };
};

module.exports.remove = async (req, name) => {
    if (!await definitionFor(req, name)) return NOT_FOUND;
    await req.domains.removeForTunnel(name);
    await persistent.remove(name);
    const live = req.registry.get(name);
    if (live) live.persistent = false;
    return { message: `${name} is no longer persistent` };
};

module.exports.addDomain = async (req, name, input) => {
    const definition = await definitionFor(req, name);
    if (!definition) return NOT_FOUND;
    try {
        await req.quotas.enforce(definition.accountId, "domains", await req.domains.countFor(definition.accountId));
        const domain = await req.domains.add(input.hostname, name, definition.accountId);
        return { message: `${domain.hostname} added`, domain };
    } catch (err) {
        return { code: { bad_request: 400, conflict: 409, quota_exceeded: 429 }[err.code] || 500, message: err.message };
    }
};

module.exports.checkDomain = async (req, name, hostname) => {
    const domain = await domainOf(req, name, hostname);
    if (!domain) return { code: 404, message: "Domain not found" };
    await req.domains.check(domain);
    const current = (await req.domains.listFor(name)).find(entry => entry.hostname === domain);
    return { message: current.state === "active" ? `${domain} is active` : `${domain} checked`, domain: current };
};

module.exports.removeDomain = async (req, name, hostname) => {
    const domain = await domainOf(req, name, hostname);
    if (!domain) return { code: 404, message: "Domain not found" };
    await req.domains.remove(domain);
    return { message: `${domain} removed` };
};
