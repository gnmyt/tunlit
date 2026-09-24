const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("invites", {
    accountId: { type: Sequelize.INTEGER, allowNull: false },
    label: { type: Sequelize.STRING, allowNull: false },
    tokenHash: { type: Sequelize.STRING, allowNull: false, unique: true },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    lastUsedAt: { type: Sequelize.DATE },
    uses: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
}, { freezeTableName: true, updatedAt: false });
