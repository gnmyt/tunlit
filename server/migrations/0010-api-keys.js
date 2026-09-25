const { DataTypes } = require("sequelize");

module.exports.up = async queryInterface => {
    await queryInterface.addColumn("devices", "kind", { type: DataTypes.STRING, allowNull: false, defaultValue: "device" });
};
