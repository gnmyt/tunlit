const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const DEFAULTS = {
    listen: "0.0.0.0",
    port: 8080,
    httpsPort: 443,
    redirectPort: 80,
    baseDomain: "",
    publicUrl: "",
    tlsMode: "proxy",
    acmeDirectoryUrl: "",
    trustProxy: false,
    httpMode: "subdomain",
    gracePeriod: 30,
};

const ENV = {
    listen: "TUNLIT_LISTEN",
    port: "TUNLIT_PORT",
    httpsPort: "TUNLIT_HTTPS_PORT",
    redirectPort: "TUNLIT_REDIRECT_PORT",
    tlsMode: "TUNLIT_TLS_MODE",
    acmeDirectoryUrl: "TUNLIT_ACME_DIRECTORY",
    baseDomain: "TUNLIT_BASE_DOMAIN",
    publicUrl: "TUNLIT_PUBLIC_URL",
    trustProxy: "TUNLIT_TRUST_PROXY",
    httpMode: "TUNLIT_HTTP_MODE",
    gracePeriod: "TUNLIT_GRACE_PERIOD",
};

const UI_SETTING_KEYS = ["baseDomain", "publicUrl", "httpMode", "gracePeriod", "tlsMode", "trustProxy"];

const parseBool = value => ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());

const normalize = config => {
    config.port = Number(config.port);
    config.httpsPort = Number(config.httpsPort);
    config.redirectPort = Number(config.redirectPort);
    config.gracePeriod = Number(config.gracePeriod);
    config.baseDomain = String(config.baseDomain || "").trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
    config.httpMode = String(config.httpMode || "subdomain").trim().toLowerCase();
    config.tlsMode = String(config.tlsMode || "proxy").trim().toLowerCase();
    config.acmeDirectoryUrl = String(config.acmeDirectoryUrl || "").trim();

    config.managesTls = config.tlsMode === "acme";
    config.trustProxy = config.managesTls
        ? false
        : typeof config.trustProxy === "boolean" ? config.trustProxy : parseBool(config.trustProxy);

    config.publicUrlConfigured = String(config.publicUrlConfigured ?? config.publicUrl ?? "").trim().replace(/\/+$/, "");
    config.publicUrl = config.publicUrlConfigured || (config.baseDomain ? `https://${config.baseDomain}` : "");
    config.publicScheme = config.publicUrl.startsWith("http://") ? "http" : "https";
    config.wildcard = config.httpMode === "subdomain";
    config.ready = !!config.baseDomain;
};

const validate = config => {
    const problems = [];
    if (!["subdomain", "path"].includes(config.httpMode)) problems.push("httpMode must be \"subdomain\" or \"path\"");
    if (!["proxy", "acme"].includes(config.tlsMode)) problems.push("tlsMode must be \"proxy\" or \"acme\"");
    for (const key of ["port", "httpsPort", "redirectPort"]) {
        if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > 65535) problems.push(`${key} must be a number between 1 and 65535`);
    }
    if (!Number.isFinite(config.gracePeriod) || config.gracePeriod < 0) problems.push("gracePeriod must be a non-negative number of seconds");
    if (config.publicUrlConfigured && !/^https?:\/\/[^/\s]+$/.test(config.publicUrlConfigured)) problems.push("publicUrl must look like https://host[:port] without a path");
    if (config.baseDomain && !/^[a-z0-9.-]+$/.test(config.baseDomain)) problems.push("baseDomain must be a hostname");
    return problems;
};

const loadConfig = () => {
    const file = process.env.TUNLIT_CONFIG || path.join(process.cwd(), "config.yml");
    let fromFile = {};
    if (fs.existsSync(file)) {
        const parsed = yaml.load(fs.readFileSync(file, "utf8"));
        if (parsed && typeof parsed !== "object") throw new Error(`${file} must contain a YAML mapping`);
        fromFile = parsed || {};
    }

    const config = { ...DEFAULTS };
    const sources = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, "default"]));
    for (const key of Object.keys(DEFAULTS)) {
        if (fromFile[key] !== undefined && fromFile[key] !== null && fromFile[key] !== "") { config[key] = fromFile[key]; sources[key] = "file"; }
    }
    for (const [key, name] of Object.entries(ENV)) {
        if (process.env[name] !== undefined && process.env[name] !== "") { config[key] = process.env[name]; sources[key] = "env"; }
    }

    normalize(config);
    const problems = validate(config);
    if (problems.length) throw new Error("Invalid configuration:\n  - " + problems.join("\n  - "));

    config.sources = sources;
    config.configFile = file;
    return config;
};

const applySettings = (config, settings) => {
    const next = { ...config, ...settings };
    if ("publicUrl" in settings) next.publicUrlConfigured = settings.publicUrl;
    normalize(next);
    const problems = validate(next);
    if (problems.length) throw Object.assign(new Error(problems.join(", ")), { code: "invalid_settings" });
    Object.assign(config, next);
    for (const key of Object.keys(settings)) config.sources[key] = "ui";
    return config;
};

const applyStored = (config, stored) => {
    for (const key of UI_SETTING_KEYS) {
        const value = stored[key];
        if (value === undefined || value === null || value === "") continue;
        config[key] = value;
        config.sources[key] = "ui";
    }
    if ("publicUrl" in stored) config.publicUrlConfigured = stored.publicUrl;
    normalize(config);
    const problems = validate(config);
    if (problems.length) throw new Error("Stored settings are invalid:\n  - " + problems.join("\n  - "));
    return config;
};

module.exports = { loadConfig, applySettings, applyStored, UI_SETTING_KEYS };
