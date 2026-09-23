const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("usage", {
    accountId: { type: Sequelize.INTEGER, allowNull: false },
    month: { type: Sequelize.STRING, allowNull: false },
    bytesIn: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    bytesOut: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    requests: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
}, { freezeTableName: true, timestamps: false });
