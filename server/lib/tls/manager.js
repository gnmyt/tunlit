const tls = require("node:tls");
const acme = require("acme-client");
const store = require("./store");
const providers = require("./providers");
const logger = require("../../utils/logger");

const RENEW_BEFORE = 30 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;

const domainsFor = config => config.wildcard ? [config.baseDomain, `*.${config.baseDomain}`] : [config.baseDomain];

class CertificateManager {
    constructor(config) {
        this.config = config;
        this.context = null;
        this.current = null;
        this.state = "none";
        this.error = null;
        this.busy = false;
        this.challenges = new Map();
        this.timer = null;
    }

    get domain() {
        return this.config.baseDomain;
    }

    async load() {
        const row = await store.certificate(this.domain);
        if (!row) {
            this.state = "none";
            return null;
        }
        this.current = {
            domain: row.domain,
            altNames: JSON.parse(row.altNames || "[]"),
            issuedAt: row.issuedAt,
            expiresAt: row.expiresAt,
        };
        this.context = tls.createSecureContext({ key: row.privateKey, cert: row.chain });
        this.state = new Date(row.expiresAt).getTime() < Date.now() ? "expired" : "ready";
        return this.current;
    }

    covers() {
        if (!this.current) return false;
        const wanted = domainsFor(this.config);
        return wanted.every(name => this.current.altNames.includes(name));
    }

    dueForRenewal() {
        if (!this.current) return true;
        if (!this.covers()) return true;
        return new Date(this.current.expiresAt).getTime() - Date.now() < RENEW_BEFORE;
    }

    status() {
        const state = this.busy ? this.state
            : !this.current ? (this.error ? "error" : "none")
                : !this.covers() ? "stale"
                    : new Date(this.current.expiresAt).getTime() < Date.now() ? "expired" : "ready";

        return {
            state,
            busy: this.busy,
            error: this.error,
            domains: domainsFor(this.config),
            certificate: this.current,
            dueForRenewal: this.dueForRenewal(),
            pendingRecords: providers.get("manual").records(),
        };
    }

    async client() {
        const settings = await store.settings();
        let accountKey = settings.accountKey;
        if (!accountKey) {
            accountKey = (await acme.crypto.createPrivateKey()).toString();
            await store.saveSettings({ accountKey });
        }
        const directoryUrl = this.config.acmeDirectoryUrl || acme.directory.letsencrypt.production;
        return { settings, client: new acme.Client({ directoryUrl, accountKey }) };
    }

    challengeHandlers(settings) {
        const provider = providers.get(settings.provider) || providers.get("manual");

        const create = async (authz, challenge, keyAuthorization) => {
            if (challenge.type === "http-01") {
                this.challenges.set(challenge.token, keyAuthorization);
                return;
            }
            const record = `_acme-challenge.${authz.identifier.value.replace(/^\*\./, "")}`;
            logger.info(`Adding DNS challenge for ${record} via ${provider.id}`);
            await provider.create(settings.credential, record, keyAuthorization);
        };

        const remove = async (authz, challenge, keyAuthorization) => {
            if (challenge.type === "http-01") {
                this.challenges.delete(challenge.token);
                return;
            }
            const record = `_acme-challenge.${authz.identifier.value.replace(/^\*\./, "")}`;
            try {
                await provider.remove(settings.credential, record, keyAuthorization);
            } catch (err) {
                logger.warn(`Could not remove the DNS challenge for ${record}: ${err.message}`);
            }
        };

        return { create, remove };
    }

    async request() {
        if (this.busy) return { code: 409, message: "A certificate request is already running" };
        if (!this.config.ready) return { code: 400, message: "Set the base domain first" };

        const { settings, client } = await this.client();
        if (this.config.wildcard && settings.provider === "http") {
            return { code: 400, message: "Subdomain forwarding needs a wildcard certificate, which requires a DNS provider" };
        }
        const provider = providers.get(settings.provider);
        if (!provider) return { code: 400, message: `Unknown DNS provider "${settings.provider}"` };
        if (provider.needsCredential && !settings.credential) return { code: 400, message: `${provider.title} needs an API token` };

        this.busy = true;
        this.run(settings, client).catch(err => logger.error(`Certificate request crashed: ${err.stack || err}`));
        return { message: "Requesting a certificate", status: this.status() };
    }

    async run(settings, client) {
        this.state = "requesting";
        this.error = null;
        const altNames = domainsFor(this.config);

        try {
            const [key, csr] = await acme.crypto.createCsr({ commonName: altNames[0], altNames });
            const handlers = this.challengeHandlers(settings);
            const chain = await client.auto({
                csr,
                email: settings.email || undefined,
                termsOfServiceAgreed: true,
                skipChallengeVerification: true,
                challengePriority: settings.provider === "http" ? ["http-01"] : ["dns-01"],
                challengeCreateFn: handlers.create,
                challengeRemoveFn: handlers.remove,
            });

            const info = acme.crypto.readCertificateInfo(chain);
            await store.saveCertificate({
                domain: this.domain, altNames,
                privateKey: key.toString(), chain: chain.toString(),
                expiresAt: info.notAfter,
            });
            providers.get("manual").reset();
            await this.load();
            logger.info(`Certificate issued for ${altNames.join(", ")}, valid until ${info.notAfter.toISOString()}`);
        } catch (err) {
            this.error = err.message;
            this.state = this.current ? "ready" : "error";
            providers.get("manual").reset();
            logger.error(`Certificate request failed: ${err.message}`);
        } finally {
            this.busy = false;
        }
    }

    continueManual() {
        return providers.get("manual").continue();
    }

    challengeResponse(token) {
        return this.challenges.get(token) || null;
    }

    secureContext() {
        return this.context;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.maybeRenew(), CHECK_INTERVAL);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async maybeRenew() {
        if (this.busy || !this.config.managesTls || !this.config.ready) return;
        if (!this.dueForRenewal()) return;
        logger.info("Certificate is due for renewal");
        const result = await this.request();
        if (result.code) logger.warn(`Renewal could not start: ${result.message}`);
    }
}

module.exports = { CertificateManager, domainsFor };
