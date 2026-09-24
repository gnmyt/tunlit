const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.createTable("connections", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        tunnel: { type: DataTypes.STRING, allowNull: false },
        key: { type: DataTypes.STRING, allowNull: false, unique: true },
        protocol: { type: DataTypes.STRING, allowNull: false },
        ip: { type: DataTypes.STRING, allowNull: false },
        intel: { type: DataTypes.TEXT, allowNull: false },
        client: { type: DataTypes.STRING, allowNull: false },
        joiner: { type: DataTypes.STRING, allowNull: false },
        startedAt: { type: DataTypes.DATE, allowNull: false },
        endedAt: { type: DataTypes.DATE, allowNull: true },
        bytesIn: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        bytesOut: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        reason: { type: DataTypes.STRING, allowNull: true },
        detail: { type: DataTypes.TEXT, allowNull: true },
    });
    await queryInterface.addIndex("connections", ["tunnel", "startedAt"]);
};
