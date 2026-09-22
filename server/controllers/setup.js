const settingsStore = require("../lib/settings");
const accounts = require("../lib/accounts");
const { applySettings, UI_SETTING_KEYS } = require("../utils/config");
const logger = require("../utils/logger");

module.exports.isSetupRequired = async () => !await accounts.count();

module.exports.getSetupStatus = async config => {
    const setupRequired = await module.exports.isSetupRequired();
    const status = { setupRequired, ready: config.ready };
    if (!setupRequired) return status;
    return {
        ...status,
        settings: Object.fromEntries(UI_SETTING_KEYS.map(key => [key, key === "publicUrl" ? config.publicUrlConfigured : config[key]])),
        sources: Object.fromEntries(UI_SETTING_KEYS.map(key => [key, config.sources[key]])),
    };
};

module.exports.validateAccount = ({ username, password }) => accounts.validate({ username, password });

module.exports.pickSettings = body => {
    const settings = {};
    for (const key of UI_SETTING_KEYS) if (body[key] !== undefined) settings[key] = body[key];
    if ("gracePeriod" in settings) settings.gracePeriod = Number(settings.gracePeriod);
    if ("trustProxy" in settings) settings.trustProxy = settings.trustProxy === true || settings.trustProxy === "true";
    return settings;
};

module.exports.completeSetup = async (config, { username, password, settings }) => {
    if (!await module.exports.isSetupRequired()) return { code: 409, message: "Setup has already been completed" };
    const accountError = accounts.validate({ username, password });
    if (accountError) return { code: 400, message: accountError };

    const picked = module.exports.pickSettings(settings || {});
    const changed = Object.fromEntries(Object.entries(picked)
        .filter(([key, value]) => value !== (key === "publicUrl" ? config.publicUrlConfigured : config[key])));
    try {
        applySettings(config, changed);
    } catch (err) {
        return { code: 400, message: err.message };
    }
    if (!config.ready) return { code: 400, message: "baseDomain is required" };

    const created = await accounts.create({ username, password, role: "admin" });
    if (created.code) return created;

    await settingsStore.write(changed);
    logger.info(`Setup completed, admin account "${username}" created`);
    return { message: "Setup complete", account: created.account };
};
