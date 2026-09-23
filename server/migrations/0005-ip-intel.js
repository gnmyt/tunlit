const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.addColumn("requests", "intel", { type: DataTypes.TEXT, allowNull: true });
};
