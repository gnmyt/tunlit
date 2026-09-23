const INTERVAL = 2000;
const BUCKETS = 90;

const empty = () => ({
    buckets: [],
    totals: { in: 0, out: 0, requests: 0 },
    pendingRequests: 0,
    lastSent: 0,
    lastReceived: 0,
    session: null,
});

class Stats {
    constructor(registry, quotas, { interval = INTERVAL, buckets = BUCKETS } = {}) {
        this.registry = registry;
        this.quotas = quotas;
        this.interval = interval;
        this.limit = buckets;
        this.series = new Map();
        this.timer = null;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.sample(), this.interval);
        this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    _for(tunnelId) {
        let entry = this.series.get(tunnelId);
        if (!entry) {
            entry = empty();
            this.series.set(tunnelId, entry);
        }
        return entry;
    }

    recordRequest(tunnelId) {
        this._for(tunnelId).pendingRequests += 1;
    }

    sample() {
        const now = Date.now();
        for (const tunnel of this.registry.tunnels.values()) {
            const entry = this._for(tunnel.id);
            const session = tunnel.session;

            let inBytes = 0;
            let outBytes = 0;
            if (session && !session.closed) {
                if (entry.session !== session) {
                    entry.session = session;
                    entry.lastSent = 0;
                    entry.lastReceived = 0;
                }
                inBytes = Math.max(0, session.bytesSent - entry.lastSent);
                outBytes = Math.max(0, session.bytesReceived - entry.lastReceived);
                entry.lastSent = session.bytesSent;
                entry.lastReceived = session.bytesReceived;
            } else {
                entry.session = null;
            }

            const requests = entry.pendingRequests;
            entry.pendingRequests = 0;
            entry.totals.in += inBytes;
            entry.totals.out += outBytes;
            entry.totals.requests += requests;
            this.quotas.record(tunnel.accountId, inBytes, outBytes, requests);

            entry.buckets.push({ t: now, in: inBytes, out: outBytes, requests });
            if (entry.buckets.length > this.limit) entry.buckets.splice(0, entry.buckets.length - this.limit);
        }
    }

    read(tunnelId) {
        const entry = this.series.get(tunnelId);
        const seconds = this.interval / 1000;
        if (!entry) return { interval: seconds, buckets: [], totals: { in: 0, out: 0, requests: 0 }, rates: { in: 0, out: 0 } };

        const recent = entry.buckets.slice(-5);
        const average = key => recent.length
            ? recent.reduce((sum, bucket) => sum + bucket[key], 0) / (recent.length * seconds)
            : 0;

        return {
            interval: seconds,
            buckets: entry.buckets,
            totals: { ...entry.totals },
            rates: { in: Math.round(average("in")), out: Math.round(average("out")) },
        };
    }

    forget(tunnelId) {
        this.series.delete(tunnelId);
    }
}

module.exports = { Stats };
