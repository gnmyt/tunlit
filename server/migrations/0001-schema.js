const { DataTypes } = require("sequelize");

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false };
const owner = { type: DataTypes.INTEGER, allowNull: false, references: { model: "accounts", key: "id" }, onDelete: "CASCADE" };
const created = { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW };

const TABLES = {
    accounts: {
        id,
        username: { type: DataTypes.STRING, allowNull: false, unique: true },
        passwordHash: { type: DataTypes.STRING, allowNull: false },
        role: { type: DataTypes.STRING, allowNull: false, defaultValue: "user" },
        totpSecret: { type: DataTypes.STRING, allowNull: true },
        totpEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: created,
    },
    sessions: {
        id,
        accountId: owner,
        token: { type: DataTypes.STRING, allowNull: false, unique: true },
        ip: { type: DataTypes.STRING, allowNull: true },
        userAgent: { type: DataTypes.STRING, allowNull: true },
        createdAt: created,
        lastSeen: created,
    },
    devices: {
        id,
        accountId: owner,
        name: { type: DataTypes.STRING, allowNull: false },
        tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
        ip: { type: DataTypes.STRING, allowNull: true },
        userAgent: { type: DataTypes.STRING, allowNull: true },
        createdAt: created,
        lastUsedAt: { type: DataTypes.DATE, allowNull: true },
    },
    passkeys: {
        id,
        accountId: owner,
        name: { type: DataTypes.STRING, allowNull: false, defaultValue: "Passkey" },
        credentialId: { type: DataTypes.TEXT, allowNull: false, unique: true },
        publicKey: { type: DataTypes.TEXT, allowNull: false },
        counter: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        deviceType: { type: DataTypes.STRING, allowNull: true },
        backedUp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        transports: { type: DataTypes.TEXT, allowNull: true },
        createdAt: created,
        lastUsedAt: { type: DataTypes.DATE, allowNull: true },
    },
    oidc_providers: {
        id,
        name: { type: DataTypes.STRING, allowNull: false },
        issuer: { type: DataTypes.STRING, allowNull: false },
        clientId: { type: DataTypes.STRING, allowNull: false },
        clientSecret: { type: DataTypes.TEXT, allowNull: true },
        scope: { type: DataTypes.STRING, allowNull: false, defaultValue: "openid profile email" },
        usernameClaim: { type: DataTypes.STRING, allowNull: false, defaultValue: "preferred_username" },
        createAccounts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: created,
    },
    tunnels: {
        id,
        name: { type: DataTypes.STRING, allowNull: false, unique: true },
        accountId: owner,
        allowedIps: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
        auth: { type: DataTypes.STRING, allowNull: false, defaultValue: "none" },
        passwordHash: { type: DataTypes.STRING, allowNull: true },
        createdAt: created,
    },
    requests: {
        id,
        tunnel: { type: DataTypes.STRING, allowNull: false },
        time: { type: DataTypes.DATE, allowNull: false },
        duration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "http" },
        method: { type: DataTypes.STRING, allowNull: true },
        path: { type: DataTypes.TEXT, allowNull: true },
        status: { type: DataTypes.INTEGER, allowNull: true },
        ip: { type: DataTypes.STRING, allowNull: true },
        host: { type: DataTypes.STRING, allowNull: true },
        requestHeaders: { type: DataTypes.TEXT, allowNull: true },
        requestBody: { type: DataTypes.BLOB, allowNull: true },
        requestBytes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        requestTruncated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        responseHeaders: { type: DataTypes.TEXT, allowNull: true },
        responseBody: { type: DataTypes.BLOB, allowNull: true },
        responseBytes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        responseTruncated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    certificates: {
        id,
        domain: { type: DataTypes.STRING, allowNull: false, unique: true },
        altNames: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
        privateKey: { type: DataTypes.TEXT, allowNull: false },
        chain: { type: DataTypes.TEXT, allowNull: false },
        issuedAt: created,
        expiresAt: { type: DataTypes.DATE, allowNull: false },
    },
    acme: {
        id,
        email: { type: DataTypes.STRING, allowNull: true },
        provider: { type: DataTypes.STRING, allowNull: false, defaultValue: "manual" },
        credential: { type: DataTypes.TEXT, allowNull: true },
        accountKey: { type: DataTypes.TEXT, allowNull: true },
    },
    settings: {
        key: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
        value: { type: DataTypes.TEXT, allowNull: true },
    },
};

module.exports.up = async queryInterface => {
    for (const [name, columns] of Object.entries(TABLES)) await queryInterface.createTable(name, columns);
    await queryInterface.addIndex("requests", ["tunnel", "id"]);
};
