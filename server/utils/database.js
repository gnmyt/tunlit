const path = require("node:path");
const { Sequelize } = require("sequelize");
const { dataDir } = require("./paths");
const logger = require("./logger");

const storage = path.join(dataDir(), "tunlit.db");

Sequelize.DATE.prototype._stringify = function (date) {
    return (date instanceof Date ? date : new Date(date)).toISOString();
};

module.exports = new Sequelize({
    dialect: "sqlite",
    storage,
    logging: message => logger.debug(message),
    query: { raw: true },
});

module.exports.storagePath = storage;
