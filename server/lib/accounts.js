const Account = require("../models/Account");
const Session = require("../models/Session");
const Device = require("../models/Device");
const Invite = require("../models/Invite");
const { hashPassword, verifyPassword } = require("../utils/password");

const ABSENT = hashPassword("account-that-does-not-exist");

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
const ROLES = ["admin", "user"];

const describe = account => ({
    id: account.id,
    username: account.username,
    role: account.role,
    quotas: account.quotas ? JSON.parse(account.quotas) : null,
    createdAt: account.createdAt,
});

const validate = ({ username, password }) => {
    if (username !== undefined && !USERNAME_REGEX.test(String(username || ""))) {
        return "The username must be 3 to 32 letters, digits, dots, dashes or underscores";
    }
    if (password !== undefined && String(password || "").length < 8) return "The password must be at least 8 characters";
    return null;
};

const count = () => Account.count();

const byUsername = username => Account.findOne({ where: { username: String(username || "") } });

const byId = id => Account.findByPk(id);

const list = () => Account.findAll({ order: [["id", "ASC"]] }).then(rows => rows.map(describe));

const create = async ({ username, password, role = "user" }) => {
    const problem = validate({ username, password });
    if (problem) return { code: 400, message: problem };
    if (!ROLES.includes(role)) return { code: 400, message: `The role must be one of ${ROLES.join(", ")}` };
    if (await byUsername(username)) return { code: 409, message: "That username is taken" };

    await Account.create({ username, passwordHash: hashPassword(password), role });
    return { account: describe(await byUsername(username)) };
};

const adminCount = () => Account.count({ where: { role: "admin" } });

const update = async (id, { role, password, quotas }) => {
    const account = await byId(id);
    if (!account) return { code: 404, message: "That account does not exist" };

    const values = {};

    if (role !== undefined && role !== account.role) {
        if (!ROLES.includes(role)) return { code: 400, message: `The role must be one of ${ROLES.join(", ")}` };
        if (account.role === "admin" && await adminCount() <= 1) return { code: 409, message: "The last admin cannot lose the role" };
        values.role = role;
    }

    if (password !== undefined) {
        const problem = validate({ password });
        if (problem) return { code: 400, message: problem };
        values.passwordHash = hashPassword(password);
        await Session.destroy({ where: { accountId: account.id } });
    }

    if (quotas !== undefined) values.quotas = quotas ? JSON.stringify(quotas) : null;

    if (Object.keys(values).length) await Account.update(values, { where: { id: account.id } });
    return { account: describe(await byId(account.id)) };
};

const remove = async id => {
    const account = await byId(id);
    if (!account) return { code: 404, message: "That account does not exist" };
    if (account.role === "admin" && await adminCount() <= 1) return { code: 409, message: "The last admin cannot be deleted" };

    await Session.destroy({ where: { accountId: account.id } });
    await Device.destroy({ where: { accountId: account.id } });
    await Invite.destroy({ where: { accountId: account.id } });
    await Account.destroy({ where: { id: account.id } });
    return { message: "Account deleted" };
};

const checkCredentials = async ({ username, password } = {}) => {
    const account = await byUsername(username);
    const matches = await verifyPassword(String(password || ""), account ? account.passwordHash : ABSENT);
    return account && matches ? account : null;
};

module.exports = { describe, validate, count, byId, byUsername, list, create, update, remove, checkCredentials, USERNAME_REGEX };
