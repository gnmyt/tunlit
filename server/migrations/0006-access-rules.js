const { DataTypes } = require("sequelize");

module.exports.up = async (queryInterface, db) => {
    await queryInterface.addColumn("tunnels", "rules", { type: DataTypes.TEXT, allowNull: false, defaultValue: "{}" });
    const rows = await db.query("SELECT id, allowedIps FROM tunnels", { type: db.QueryTypes.SELECT });
    for (const row of rows) {
        const rules = JSON.stringify({ allow: { ips: JSON.parse(row.allowedIps || "[]"), countries: [] }, block: { ips: [], countries: [], categories: [] } });
        await db.query("UPDATE tunnels SET rules = ? WHERE id = ?", { replacements: [rules, row.id] });
    }
    await queryInterface.removeColumn("tunnels", "allowedIps");
};
