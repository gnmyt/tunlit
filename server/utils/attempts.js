const WINDOW = 15 * 60 * 1000;
const MAX_FAILURES = 20;
const MAX_KEYS = 10_000;

class AttemptLimiter {
    constructor({ window = WINDOW, max = MAX_FAILURES } = {}) {
        this.window = window;
        this.max = max;
        this.failures = new Map();
        this.sweeper = setInterval(() => this.sweep(), window);
        this.sweeper.unref();
    }

    blocked(key) {
        const entry = this.failures.get(key);
        if (!entry) return false;
        if (Date.now() - entry.since > this.window) { this.failures.delete(key); return false; }
        return entry.count >= this.max;
    }

    record(key) {
        const now = Date.now();
        const entry = this.failures.get(key);
        if (entry && now - entry.since <= this.window) { entry.count += 1; return; }
        if (this.failures.size >= MAX_KEYS) this.sweep();
        if (this.failures.size >= MAX_KEYS) this.failures.delete(this.failures.keys().next().value);
        this.failures.set(key, { count: 1, since: now });
    }

    forget(key) {
        this.failures.delete(key);
    }

    sweep() {
        const now = Date.now();
        for (const [key, entry] of this.failures) if (now - entry.since > this.window) this.failures.delete(key);
    }
}

module.exports = { AttemptLimiter };
