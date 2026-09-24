const crypto = require("node:crypto");

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MIXED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const NAME_REGEX = /^[a-z0-9-]{3,32}$/;
const RESERVED = new Set(["tunlit"]);
const SECRET_LENGTH = 26;

const randomFrom = (alphabet, length) => {
    const bytes = crypto.randomBytes(length);
    let out = "";
    for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
};

const randomId = (length = 6) => randomFrom(ALPHABET, length);
const randomSecret = () => randomFrom(MIXED, SECRET_LENGTH);
const randomToken = (length = 32) => randomFrom(MIXED, length);

const isValidName = name => NAME_REGEX.test(name) && !RESERVED.has(name);
const isReserved = name => RESERVED.has(name);

const hashSecret = secret => crypto.createHash("sha256").update(secret).digest();

const splitShareCode = code => {
    if (typeof code !== "string" || !/^[a-z0-9-]+[A-Za-z0-9]{26}$/.test(code)) return null;
    return { id: code.slice(0, -SECRET_LENGTH), secret: code.slice(-SECRET_LENGTH) };
};

module.exports = { randomId, randomSecret, randomToken, isValidName, isReserved, hashSecret, splitShareCode, NAME_REGEX };
