const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("acme", {
    email: { type: Sequelize.STRING },
    provider: { type: Sequelize.STRING, allowNull: false, defaultValue: "manual" },
    credential: { type: Sequelize.TEXT },
    accountKey: { type: Sequelize.TEXT },
}, { freezeTableName: true, timestamps: false });
