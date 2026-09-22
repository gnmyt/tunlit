const WAIT_TIMEOUT = 15 * 60 * 1000;

const pending = new Map();
let waiter = null;

module.exports = {
    id: "manual",
    title: "Add the record yourself",
    needsCredential: false,

    records: () => [...pending.values()],

    create(_token, record, value) {
        pending.set(`${record}:${value}`, { record, value });
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                waiter = null;
                reject(new Error("Timed out waiting for the TXT record to be added"));
            }, WAIT_TIMEOUT);
            timer.unref();
            waiter = { resolve: () => { clearTimeout(timer); waiter = null; resolve(); }, reject };
        });
    },

    remove(_token, record, value) {
        pending.delete(`${record}:${value}`);
    },

    continue() {
        if (!waiter) return false;
        waiter.resolve();
        return true;
    },

    reset() {
        pending.clear();
        if (waiter) waiter.reject(new Error("Cancelled"));
        waiter = null;
    },
};
