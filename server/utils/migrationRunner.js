const fs = require("node:fs");
const path = require("node:path");
const { DataTypes } = require("sequelize");
const db = require("./database");
const logger = require("./logger");

const MIGRATION_DIR = path.join(__dirname, "..", "migrations");

const ensureTable = async queryInterface => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("SequelizeMeta")) return;
    await queryInterface.createTable("SequelizeMeta", {
        name: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
    });
};

const executed = async () => {
    const rows = await db.query("SELECT name FROM SequelizeMeta ORDER BY name ASC", { type: db.QueryTypes.SELECT });
    return rows.map(row => row.name);
};

const runMigrations = async () => {
    const queryInterface = db.getQueryInterface();
    await ensureTable(queryInterface);

    const done = new Set(await executed());
    const files = fs.existsSync(MIGRATION_DIR)
        ? fs.readdirSync(MIGRATION_DIR).filter(file => file.endsWith(".js")).sort()
        : [];
    const pending = files.filter(file => !done.has(file));
    if (!pending.length) return;

    for (const file of pending) {
        const migration = require(path.join(MIGRATION_DIR, file));
        await migration.up(queryInterface, db);
        await db.query("INSERT INTO SequelizeMeta (name) VALUES (?)", { replacements: [file] });
        logger.info(`Applied migration ${file}`);
    }
};

module.exports = { runMigrations };
