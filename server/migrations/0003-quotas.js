const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.addColumn("accounts", "quotas", { type: DataTypes.TEXT, allowNull: true });

    await queryInterface.createTable("usage", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        accountId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "accounts", key: "id" }, onDelete: "CASCADE" },
        month: { type: DataTypes.STRING, allowNull: false },
        bytesIn: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
        bytesOut: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
        requests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex("usage", ["accountId", "month"], { unique: true });
};
