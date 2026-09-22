const {
    generateRegistrationOptions, verifyRegistrationResponse,
    generateAuthenticationOptions, verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const Passkey = require("../models/Passkey");
const Account = require("../models/Account");
const logger = require("../utils/logger");

const RP_NAME = "tunlit";
const CHALLENGE_TTL = 5 * 60 * 1000;

const challenges = new Map();

const remember = (challenge, data) => {
    const now = Date.now();
    for (const [key, entry] of challenges) if (now - entry.at > CHALLENGE_TTL) challenges.delete(key);
    challenges.set(challenge, { at: now, ...data });
};

const take = challenge => {
    const entry = challenges.get(challenge);
    challenges.delete(challenge);
    if (!entry || Date.now() - entry.at > CHALLENGE_TTL) return null;
    return entry;
};

const challengeOf = response =>
    JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString()).challenge;

const transportsOf = passkey => (passkey.transports ? JSON.parse(passkey.transports) : undefined);

const describe = passkey => ({
    id: passkey.id,
    name: passkey.name,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
});

const relyingParty = origin => ({ origin, rpID: new URL(origin).hostname });

const startRegistration = async (account, origin) => {
    const { rpID } = relyingParty(origin);
    const existing = await Passkey.findAll({ where: { accountId: account.id } });

    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userID: Buffer.from(String(account.id)),
        userName: account.username,
        userDisplayName: account.username,
        attestationType: "none",
        excludeCredentials: existing.map(passkey => ({
            id: passkey.credentialId, type: "public-key", transports: transportsOf(passkey),
        })),
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });

    remember(options.challenge, { kind: "registration", accountId: account.id });
    return options;
};

const finishRegistration = async (account, response, name, origin) => {
    const entry = take(challengeOf(response));
    if (!entry || entry.kind !== "registration" || entry.accountId !== account.id) {
        return { code: 400, message: "That registration has expired, start again" };
    }

    try {
        const { origin: expectedOrigin, rpID } = relyingParty(origin);
        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: challengeOf(response),
            expectedOrigin,
            expectedRPID: rpID,
        });
        if (!verification.verified || !verification.registrationInfo) {
            return { code: 400, message: "The passkey could not be verified" };
        }

        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        await Passkey.create({
            accountId: account.id,
            name: String(name || "").trim().slice(0, 40) || "Passkey",
            credentialId: credential.id,
            publicKey: Buffer.from(credential.publicKey).toString("base64url"),
            counter: credential.counter,
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            transports: response.response.transports ? JSON.stringify(response.response.transports) : null,
        });

        logger.info(`${account.username} added a passkey`);
        return { message: "Passkey added" };
    } catch (err) {
        logger.warn(`Passkey registration failed: ${err.message}`);
        return { code: 400, message: err.message };
    }
};

const startAuthentication = async (username, origin) => {
    const { rpID } = relyingParty(origin);
    let allowCredentials;

    if (username) {
        const account = await Account.findOne({ where: { username: String(username) } });
        const passkeys = account ? await Passkey.findAll({ where: { accountId: account.id } }) : [];
        if (passkeys.length) {
            allowCredentials = passkeys.map(passkey => ({
                id: passkey.credentialId, type: "public-key", transports: transportsOf(passkey),
            }));
        }
    }

    const options = await generateAuthenticationOptions({ rpID, allowCredentials, userVerification: "preferred" });
    remember(options.challenge, { kind: "authentication" });
    return options;
};

const finishAuthentication = async (response, origin) => {
    const entry = take(challengeOf(response));
    if (!entry || entry.kind !== "authentication") return { code: 400, message: "That sign-in has expired, try again" };

    const passkey = await Passkey.findOne({ where: { credentialId: response.id } });
    if (!passkey) return { code: 401, message: "This passkey is not registered here" };

    const account = await Account.findByPk(passkey.accountId);
    if (!account) return { code: 401, message: "The account behind this passkey is gone" };

    try {
        const { origin: expectedOrigin, rpID } = relyingParty(origin);
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challengeOf(response),
            expectedOrigin,
            expectedRPID: rpID,
            credential: {
                id: passkey.credentialId,
                publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
                counter: passkey.counter,
                transports: transportsOf(passkey),
            },
        });
        if (!verification.verified) return { code: 401, message: "The passkey could not be verified" };

        await Passkey.update(
            { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
            { where: { id: passkey.id } },
        );
        return { account };
    } catch (err) {
        logger.warn(`Passkey sign-in failed: ${err.message}`);
        return { code: 401, message: err.message };
    }
};

const list = async accountId =>
    (await Passkey.findAll({ where: { accountId }, order: [["createdAt", "DESC"]] })).map(describe);

const remove = async (accountId, id) => {
    const passkey = await Passkey.findOne({ where: { id, accountId } });
    if (!passkey) return { code: 404, message: "Passkey not found" };
    await Passkey.destroy({ where: { id: passkey.id } });
    return { message: `${passkey.name} removed` };
};

module.exports = { startRegistration, finishRegistration, startAuthentication, finishAuthentication, list, remove };
