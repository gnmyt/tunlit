const crypto = require("node:crypto");

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

const scrypt = (password, salt, length) => new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, length, SCRYPT_OPTIONS, (err, derived) => err ? reject(err) : resolve(derived));
});

const hashPassword = password => {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
};

const verifyPassword = async (password, stored) => {
    const [scheme, saltHex, hashHex] = String(stored || "").split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scrypt(String(password), Buffer.from(saltHex, "hex"), expected.length);
    return crypto.timingSafeEqual(actual, expected);
};

module.exports = { hashPassword, verifyPassword };
