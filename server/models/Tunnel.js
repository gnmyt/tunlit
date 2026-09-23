const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("tunnels", {
    name: { type: Sequelize.STRING, allowNull: false, unique: true },
    accountId: { type: Sequelize.INTEGER, allowNull: false },
    rules: { type: Sequelize.TEXT, allowNull: false, defaultValue: "{}" },
    auth: { type: Sequelize.STRING, allowNull: false, defaultValue: "none" },
    passwordHash: { type: Sequelize.STRING },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
}, { freezeTableName: true, updatedAt: false });
