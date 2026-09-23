const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("accounts", {
    username: {type: Sequelize.STRING, allowNull: false, unique: true},
    passwordHash: {type: Sequelize.STRING, allowNull: false},
    role: {type: Sequelize.STRING, allowNull: false, defaultValue: "user"},
    totpSecret: {type: Sequelize.STRING},
    totpEnabled: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false},
    quotas: {type: Sequelize.TEXT},
    createdAt: {type: Sequelize.DATE, defaultValue: Sequelize.NOW},
}, {freezeTableName: true, updatedAt: false});
