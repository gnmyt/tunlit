const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("devices", {
    accountId: { type: Sequelize.INTEGER, allowNull: false },
    name: { type: Sequelize.STRING, allowNull: false },
    tokenHash: { type: Sequelize.STRING, allowNull: false, unique: true },
    kind: { type: Sequelize.STRING, allowNull: false, defaultValue: "device" },
    ip: { type: Sequelize.STRING },
    userAgent: { type: Sequelize.STRING },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    lastUsedAt: { type: Sequelize.DATE },
}, { freezeTableName: true, updatedAt: false });
