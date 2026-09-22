const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("settings", {
    key: { type: Sequelize.STRING, allowNull: false, primaryKey: true },
    value: { type: Sequelize.TEXT },
}, { freezeTableName: true, timestamps: false });
