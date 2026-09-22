const crypto = require("node:crypto");
const accounts = require("../lib/accounts");

const safeEqual = (a, b) => {
    const ha = crypto.createHash("sha256").update(String(a)).digest();
    const hb = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
};

const createAuth = devices => ({
    deviceFor: presented => devices.verify(presented),

    accountFor: async device => {
        const account = await accounts.byId(device.accountId);
        return account ? { id: account.id, username: account.username, role: account.role } : null;
    },

    verifyToken: async presented => !!await devices.verify(presented),

    bearerFromHeaders: headers => {
        const value = headers["authorization"];
        if (!value) return null;
        const match = /^Bearer\s+(.+)$/i.exec(value.trim());
        return match ? match[1].trim() : null;
    },
});

module.exports = { createAuth, safeEqual };
