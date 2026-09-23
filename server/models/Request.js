const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("requests", {
    tunnel: { type: Sequelize.STRING, allowNull: false },
    time: { type: Sequelize.DATE, allowNull: false },
    duration: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    kind: { type: Sequelize.STRING, allowNull: false, defaultValue: "http" },
    connection: { type: Sequelize.STRING },
    intel: { type: Sequelize.TEXT },
    method: { type: Sequelize.STRING },
    path: { type: Sequelize.TEXT },
    status: { type: Sequelize.INTEGER },
    ip: { type: Sequelize.STRING },
    host: { type: Sequelize.STRING },
    requestHeaders: { type: Sequelize.TEXT },
    requestBody: { type: Sequelize.BLOB },
    requestBytes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    requestTruncated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    responseHeaders: { type: Sequelize.TEXT },
    responseBody: { type: Sequelize.BLOB },
    responseBytes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    responseTruncated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
}, { freezeTableName: true, timestamps: false });
