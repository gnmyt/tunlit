const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.addColumn("requests", "connection", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addIndex("requests", ["connection"]);

    await queryInterface.createTable("frames", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        tunnel: { type: DataTypes.STRING, allowNull: false },
        connection: { type: DataTypes.STRING, allowNull: false },
        direction: { type: DataTypes.STRING, allowNull: false },
        opcode: { type: DataTypes.INTEGER, allowNull: false },
        time: { type: DataTypes.DATE, allowNull: false },
        bytes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        payload: { type: DataTypes.BLOB, allowNull: true },
        truncated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    });
    await queryInterface.addIndex("frames", ["connection", "id"]);
    await queryInterface.addIndex("frames", ["tunnel"]);
};
