const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("frames", {
    tunnel: { type: Sequelize.STRING, allowNull: false },
    connection: { type: Sequelize.STRING, allowNull: false },
    direction: { type: Sequelize.STRING, allowNull: false },
    opcode: { type: Sequelize.INTEGER, allowNull: false },
    time: { type: Sequelize.DATE, allowNull: false },
    bytes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    payload: { type: Sequelize.BLOB },
    truncated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
}, { freezeTableName: true, timestamps: false });
