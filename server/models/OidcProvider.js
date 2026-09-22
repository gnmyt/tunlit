const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("oidc_providers", {
    name: { type: Sequelize.STRING, allowNull: false },
    issuer: { type: Sequelize.STRING, allowNull: false },
    clientId: { type: Sequelize.STRING, allowNull: false },
    clientSecret: { type: Sequelize.TEXT },
    scope: { type: Sequelize.STRING, allowNull: false, defaultValue: "openid profile email" },
    usernameClaim: { type: Sequelize.STRING, allowNull: false, defaultValue: "preferred_username" },
    createAccounts: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
}, { freezeTableName: true, updatedAt: false });
