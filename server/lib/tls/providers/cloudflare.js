const API = "https://api.cloudflare.com/client/v4";

const call = async (token, path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
        const detail = body.errors?.map(error => error.message).join(", ") || response.statusText;
        throw new Error(`Cloudflare: ${detail}`);
    }
    return body.result;
};

const zoneFor = async (token, hostname) => {
    const labels = hostname.split(".");
    for (let i = 0; i < labels.length - 1; i++) {
        const candidate = labels.slice(i).join(".");
        const zones = await call(token, `/zones?name=${encodeURIComponent(candidate)}`);
        if (zones?.length) return zones[0];
    }
    throw new Error(`Cloudflare: no zone found for ${hostname}. Check that the token can read this zone.`);
};

module.exports = {
    id: "cloudflare",
    title: "Cloudflare",
    needsCredential: true,
    credentialLabel: "API token",

    async verify(token, hostname) {
        const zone = await zoneFor(token, hostname);
        return { message: `Token works, zone ${zone.name} found` };
    },

    async create(token, record, value) {
        const zone = await zoneFor(token, record);
        return call(token, `/zones/${zone.id}/dns_records`, {
            method: "POST",
            body: JSON.stringify({ type: "TXT", name: record, content: value, ttl: 60 }),
        });
    },

    async remove(token, record, value) {
        const zone = await zoneFor(token, record);
        const existing = await call(token, `/zones/${zone.id}/dns_records?type=TXT&name=${encodeURIComponent(record)}`);
        for (const entry of existing || []) {
            if (entry.content !== value) continue;
            await call(token, `/zones/${zone.id}/dns_records/${entry.id}`, { method: "DELETE" });
        }
    },
};
