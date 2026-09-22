const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("passkeys", {
    accountId: { type: Sequelize.INTEGER, allowNull: false },
    name: { type: Sequelize.STRING, allowNull: false, defaultValue: "Passkey" },
    credentialId: { type: Sequelize.TEXT, allowNull: false, unique: true },
    publicKey: { type: Sequelize.TEXT, allowNull: false },
    counter: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    deviceType: { type: Sequelize.STRING },
    backedUp: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    transports: { type: Sequelize.TEXT },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    lastUsedAt: { type: Sequelize.DATE },
}, { freezeTableName: true, updatedAt: false });
