const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("visitors", {
    tunnel: { type: Sequelize.STRING, allowNull: false },
    ip: { type: Sequelize.STRING, allowNull: false },
    intel: { type: Sequelize.TEXT },
    requests: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    blocked: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    reason: { type: Sequelize.STRING },
    firstSeen: { type: Sequelize.DATE, allowNull: false },
    lastSeen: { type: Sequelize.DATE, allowNull: false },
}, { freezeTableName: true, timestamps: false });
