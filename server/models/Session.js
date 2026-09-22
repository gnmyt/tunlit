const crypto = require("node:crypto");
const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("sessions", {
    accountId: { type: Sequelize.INTEGER, allowNull: false },
    token: { type: Sequelize.STRING, allowNull: false, unique: true, defaultValue: () => crypto.randomBytes(32).toString("base64url") },
    ip: { type: Sequelize.STRING },
    userAgent: { type: Sequelize.STRING },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    lastSeen: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
}, { freezeTableName: true, updatedAt: false });
