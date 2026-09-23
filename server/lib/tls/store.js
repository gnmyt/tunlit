const Acme = require("../../models/Acme");
const Certificate = require("../../models/Certificate");

const DEFAULTS = { email: null, provider: "manual", credential: null, accountKey: null };

const settings = async () => {
    const row = await Acme.findOne();
    return row ? { ...DEFAULTS, ...row } : { ...DEFAULTS };
};

const saveSettings = async values => {
    const row = await Acme.findOne();
    if (row) return Acme.update(values, { where: { id: row.id } });
    return Acme.create({ ...DEFAULTS, ...values });
};

const certificate = domain => Certificate.findOne({ where: { domain } });

const certificates = () => Certificate.findAll();

const saveCertificate = async ({ domain, altNames, privateKey, chain, expiresAt }) => {
    const values = {
        domain, altNames: JSON.stringify(altNames), privateKey, chain,
        issuedAt: new Date(), expiresAt,
    };
    const row = await Certificate.findOne({ where: { domain } });
    if (row) return Certificate.update(values, { where: { id: row.id } });
    return Certificate.create(values);
};

const forgetCertificate = domain => Certificate.destroy({ where: { domain } });

module.exports = { settings, saveSettings, certificate, certificates, saveCertificate, forgetCertificate };
