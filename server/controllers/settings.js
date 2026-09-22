const settingsStore = require("../lib/settings");
const { applySettings, UI_SETTING_KEYS } = require("../utils/config");
const { verifyPassword } = require("../utils/password");
const accounts = require("../lib/accounts");
const { pickSettings } = require("./setup");
const logger = require("../utils/logger");

module.exports.getSettings = config => ({
    settings: Object.fromEntries(UI_SETTING_KEYS.map(key => [key, key === "publicUrl" ? config.publicUrlConfigured : config[key]])),
    sources: Object.fromEntries(UI_SETTING_KEYS.map(key => [key, config.sources[key]])),
    effectivePublicUrl: config.publicUrl,
    listen: config.listen,
    port: config.port,
    configFile: config.configFile,
});

module.exports.updateSettings = async (config, body) => {
    const settings = pickSettings(body);
    if (!Object.keys(settings).length) return { code: 400, message: "No settings provided" };
    try {
        applySettings(config, settings);
    } catch (err) {
        return { code: 400, message: err.message };
    }
    await settingsStore.write(settings);
    logger.info("Settings updated from the web UI", settings);
    return module.exports.getSettings(config);
};

module.exports.changePassword = async (account, { currentPassword, newPassword }) => {
    if (!await verifyPassword(typeof currentPassword === "string" ? currentPassword : "", account.passwordHash)) {
        return { code: 401, message: "Current password is incorrect" };
    }
    const result = await accounts.update(account.id, { password: newPassword });
    if (result.code) return result;
    logger.info(`${account.username} changed the password`);
    return { message: "Password changed" };
};
