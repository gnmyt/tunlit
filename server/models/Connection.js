const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("connections", {
    tunnel: { type: Sequelize.STRING, allowNull: false },
    key: { type: Sequelize.STRING, allowNull: false, unique: true },
    protocol: { type: Sequelize.STRING, allowNull: false },
    ip: { type: Sequelize.STRING, allowNull: false },
    intel: { type: Sequelize.TEXT, allowNull: false },
    client: { type: Sequelize.STRING, allowNull: false },
    joiner: { type: Sequelize.STRING, allowNull: false },
    startedAt: { type: Sequelize.DATE, allowNull: false },
    endedAt: { type: Sequelize.DATE },
    bytesIn: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    bytesOut: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    reason: { type: Sequelize.STRING },
    detail: { type: Sequelize.TEXT },
}, { freezeTableName: true, timestamps: false });
