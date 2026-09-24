const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.createTable("invites", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        accountId: { type: DataTypes.INTEGER, allowNull: false },
        label: { type: DataTypes.STRING, allowNull: false },
        tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        lastUsedAt: { type: DataTypes.DATE, allowNull: true },
        uses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    });
};
