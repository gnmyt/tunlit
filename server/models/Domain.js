const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("domains", {
    hostname: { type: Sequelize.STRING, allowNull: false, unique: true },
    tunnelName: { type: Sequelize.STRING, allowNull: false },
    accountId: { type: Sequelize.INTEGER, allowNull: false },
    state: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending" },
    lastError: { type: Sequelize.TEXT },
    checkedAt: { type: Sequelize.DATE },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
}, { freezeTableName: true, updatedAt: false });
