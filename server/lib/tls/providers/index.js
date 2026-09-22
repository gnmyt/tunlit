const cloudflare = require("./cloudflare");
const manual = require("./manual");

const http = { id: "http", title: "No DNS provider", needsCredential: false, httpOnly: true };

const PROVIDERS = { cloudflare, manual, http };

const get = id => PROVIDERS[id] || null;

const describe = () => Object.values(PROVIDERS).map(provider => ({
    id: provider.id,
    title: provider.title,
    needsCredential: !!provider.needsCredential,
    credentialLabel: provider.credentialLabel || null,
    httpOnly: !!provider.httpOnly,
}));

module.exports = { get, describe, PROVIDERS };
