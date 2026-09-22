const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("certificates", {
    domain: { type: Sequelize.STRING, allowNull: false, unique: true },
    altNames: { type: Sequelize.TEXT, allowNull: false, defaultValue: "[]" },
    privateKey: { type: Sequelize.TEXT, allowNull: false },
    chain: { type: Sequelize.TEXT, allowNull: false },
    issuedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    expiresAt: { type: Sequelize.DATE, allowNull: false },
}, { freezeTableName: true, updatedAt: false, createdAt: false });
