const client = require("openid-client");
const crypto = require("node:crypto");
const OidcProvider = require("../models/OidcProvider");
const accounts = require("./accounts");
const logger = require("../utils/logger");

const STATE_TTL = 10 * 60 * 1000;
const states = new Map();

const remember = (state, data) => {
    const now = Date.now();
    for (const [key, entry] of states) if (now - entry.at > STATE_TTL) states.delete(key);
    states.set(state, { at: now, ...data });
};

const take = state => {
    const entry = states.get(state);
    states.delete(state);
    if (!entry || Date.now() - entry.at > STATE_TTL) return null;
    return entry;
};

const redirectUri = config => `${config.publicUrl}/@tunlit/api/auth/oidc/callback`;

const describe = provider => ({
    id: provider.id,
    name: provider.name,
    issuer: provider.issuer,
    clientId: provider.clientId,
    hasSecret: !!provider.clientSecret,
    scope: provider.scope,
    usernameClaim: provider.usernameClaim,
    createAccounts: !!provider.createAccounts,
    enabled: !!provider.enabled,
});

const list = async () => (await OidcProvider.findAll({ order: [["id", "ASC"]] })).map(describe);

const enabled = async () =>
    (await OidcProvider.findAll({ where: { enabled: true }, order: [["id", "ASC"]] }))
        .map(provider => ({ id: provider.id, name: provider.name }));

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const discover = provider => {
    const issuer = new URL(provider.issuer);
    const options = issuer.protocol === "http:" && LOOPBACK.has(issuer.hostname)
        ? { execute: [client.allowInsecureRequests] }
        : undefined;
    return client.discovery(issuer, provider.clientId, provider.clientSecret || undefined, undefined, options);
};

const save = async (id, values) => {
    if (values.issuer !== undefined) {
        let issuer;
        try {
            issuer = new URL(values.issuer);
        } catch {
            return { code: 400, message: "The issuer must be a URL" };
        }
        if (issuer.protocol === "http:" && !LOOPBACK.has(issuer.hostname)) {
            return { code: 400, message: "The issuer must be https, except on localhost" };
        }
    }
    if (id) {
        const provider = await OidcProvider.findByPk(id);
        if (!provider) return { code: 404, message: "That provider does not exist" };
        await OidcProvider.update(values, { where: { id } });
        return { provider: describe(await OidcProvider.findByPk(id)) };
    }
    for (const key of ["name", "issuer", "clientId"]) {
        if (!String(values[key] || "").trim()) return { code: 400, message: `${key} is required` };
    }
    const created = await OidcProvider.create(values);
    return { provider: describe(created) };
};

const remove = async id => {
    const provider = await OidcProvider.findByPk(id);
    if (!provider) return { code: 404, message: "That provider does not exist" };
    await OidcProvider.destroy({ where: { id } });
    return { message: `${provider.name} removed` };
};

const begin = async (id, config) => {
    const provider = await OidcProvider.findOne({ where: { id, enabled: true } });
    if (!provider) return { code: 404, message: "That provider is not available" };

    try {
        const configuration = await discover(provider);
        const state = client.randomState();
        const nonce = client.randomNonce();
        const codeVerifier = client.randomPKCECodeVerifier();
        const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

        remember(state, { nonce, codeVerifier, providerId: provider.id });

        const url = client.buildAuthorizationUrl(configuration, {
            redirect_uri: redirectUri(config),
            scope: provider.scope,
            state, nonce,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
        });
        return { url: url.href };
    } catch (err) {
        logger.error(`Could not reach the OIDC provider ${provider.name}: ${err.message}`);
        return { code: 502, message: `Could not reach ${provider.name}: ${err.message}` };
    }
};

const complete = async (query, config) => {
    const entry = take(query.state);
    if (!entry) return { code: 400, message: "That sign-in has expired, start again" };

    const provider = await OidcProvider.findByPk(entry.providerId);
    if (!provider) return { code: 404, message: "That provider is gone" };

    try {
        const configuration = await discover(provider);
        const url = new URL(`${redirectUri(config)}?${new URLSearchParams(query).toString()}`);
        const tokens = await client.authorizationCodeGrant(configuration, url, {
            expectedState: query.state,
            expectedNonce: entry.nonce,
            pkceCodeVerifier: entry.codeVerifier,
        });

        let claims = tokens.claims();
        try {
            claims = await client.fetchUserInfo(configuration, tokens.access_token, claims.sub);
        } catch (err) {
            logger.debug(`userinfo not available, using the id token: ${err.message}`);
        }

        const raw = claims[provider.usernameClaim] || claims.preferred_username || claims.email || claims.sub;
        const username = String(raw || "").split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 32);
        if (username.length < 3) return { code: 400, message: `"${raw}" is not a usable username` };

        let account = await accounts.byUsername(username);
        if (!account) {
            if (!provider.createAccounts) return { code: 403, message: `${username} has no account here` };
            const created = await accounts.create({
                username,
                password: crypto.randomBytes(24).toString("base64url"),
                role: "user",
            });
            if (created.code) return created;
            account = await accounts.byUsername(username);
            logger.info(`Created ${username} from ${provider.name}`);
        }

        logger.info(`${account.username} signed in through ${provider.name}`);
        return { account };
    } catch (err) {
        logger.error(`OIDC sign-in failed: ${err.message}`);
        return { code: 502, message: err.message };
    }
};

module.exports = { list, enabled, save, remove, begin, complete, describe, redirectUri };
