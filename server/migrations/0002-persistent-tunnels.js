const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.bulkDelete("tunnels", {});

    await queryInterface.createTable("domains", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        hostname: { type: DataTypes.STRING, allowNull: false, unique: true },
        tunnelName: { type: DataTypes.STRING, allowNull: false },
        accountId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "accounts", key: "id" }, onDelete: "CASCADE" },
        state: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
        lastError: { type: DataTypes.TEXT, allowNull: true },
        checkedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex("domains", ["tunnelName"]);
};
