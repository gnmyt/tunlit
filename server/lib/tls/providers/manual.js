const WAIT_TIMEOUT = 15 * 60 * 1000;

const pending = new Map();

const settle = (key, error) => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    clearTimeout(entry.timer);
    if (error) entry.reject(error); else entry.resolve();
};

module.exports = {
    id: "manual",
    title: "Add the record yourself",
    needsCredential: false,

    records: () => [...pending.values()].map(({ record, value }) => ({ record, value })),

    create(_token, record, value) {
        const key = `${record}:${value}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => settle(key, new Error("Timed out waiting for the TXT record to be added")), WAIT_TIMEOUT);
            timer.unref();
            pending.set(key, { record, value, timer, resolve, reject });
        });
    },

    remove() {},

    continue() {
        const keys = [...pending.keys()];
        for (const key of keys) settle(key);
        return keys.length > 0;
    },

    reset() {
        for (const key of [...pending.keys()]) settle(key, new Error("Cancelled"));
    },
};
