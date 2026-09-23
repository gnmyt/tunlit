const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.createTable("visitors", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        tunnel: { type: DataTypes.STRING, allowNull: false },
        ip: { type: DataTypes.STRING, allowNull: false },
        intel: { type: DataTypes.TEXT, allowNull: true },
        requests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        blocked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        reason: { type: DataTypes.STRING, allowNull: true },
        firstSeen: { type: DataTypes.DATE, allowNull: false },
        lastSeen: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("visitors", ["tunnel", "ip"], { unique: true });
    await queryInterface.addIndex("visitors", ["tunnel", "lastSeen"]);
};
