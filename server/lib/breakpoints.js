const { randomToken } = require("../utils/ids");

const MAX_RULES = 32;
const METHOD = /^[A-Z]{3,10}$/;
const PHASES = ["request", "response", "both"];

const fail = message => Object.assign(new Error(message), { code: "bad_request" });

const normalizeRules = input => {
    if (!Array.isArray(input)) throw fail("rules must be a list");
    if (input.length > MAX_RULES) throw fail(`At most ${MAX_RULES} breakpoints`);
    return input.map(rule => {
        const method = rule.method ? String(rule.method).trim().toUpperCase() : null;
        if (method && !METHOD.test(method)) throw fail(`"${rule.method}" is not a method`);
        const path = String(rule.path).trim();
        if (!path.startsWith("/")) throw fail("A breakpoint path must start with /");
        const phase = String(rule.phase);
        if (!PHASES.includes(phase)) throw fail(`phase must be one of ${PHASES.join(", ")}`);
        return { method, path, phase };
    });
};

class Breakpoints {
    constructor() {
        this.rules = new Map();
        this.held = new Map();
    }

    rulesFor(tunnel) {
        return this.rules.get(tunnel) || [];
    }

    setRules(tunnel, input) {
        const rules = normalizeRules(input);
        if (rules.length) this.rules.set(tunnel, rules); else this.rules.delete(tunnel);
        return rules;
    }

    matches(tunnel, method, path, phase) {
        return this.rulesFor(tunnel).some(rule => (rule.phase === phase || rule.phase === "both") && (!rule.method || rule.method === method) && path.startsWith(rule.path));
    }

    hold(tunnel, request) {
        const id = randomToken(12);
        let resolve;
        const decision = new Promise(done => { resolve = done; });
        this.held.set(id, { id, tunnel, ...request, resolve });
        return { id, decision };
    }

    settle(id, decision) {
        const entry = this.held.get(id);
        if (!entry) return false;
        this.held.delete(id);
        entry.resolve(decision);
        return true;
    }

    get(tunnel, id) {
        const entry = this.held.get(id);
        return entry && entry.tunnel === tunnel ? entry : null;
    }

    list(tunnel) {
        return [...this.held.values()].filter(entry => entry.tunnel === tunnel).map(serialize);
    }

    forget(tunnel) {
        this.rules.delete(tunnel);
        for (const entry of this.held.values()) if (entry.tunnel === tunnel) this.settle(entry.id, { action: "cancel" });
    }
}

const part = ({ headers, body, bytes, truncated }) => ({ headers, body: body ? body.toString("base64") : null, bytes, truncated });

const serialize = entry => ({
    id: entry.id,
    phase: entry.phase,
    time: entry.time,
    method: entry.method,
    path: entry.path,
    ip: entry.ip,
    host: entry.host,
    status: entry.response?.status,
    request: part(entry.request),
    ...(entry.response ? { response: { status: entry.response.status, ...part(entry.response) } } : {}),
});

module.exports = { Breakpoints, serialize };
