const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const COLORS = { error: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[32m", debug: "\x1b[35m" };
const RESET = "\x1b[0m";

const level = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const log = (lvl, message, meta) => {
    if (LEVELS[lvl] > level) return;
    const time = new Date().toISOString();
    const tag = useColor ? `${COLORS[lvl]}${lvl.padEnd(5)}${RESET}` : lvl.padEnd(5);
    const extra = meta && Object.keys(meta).length
        ? " " + Object.entries(meta).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ")
        : "";
    const line = `${time} ${tag} ${message}${extra}`;
    (lvl === "error" || lvl === "warn" ? console.error : console.log)(line);
};

module.exports = {
    error: (m, meta) => log("error", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    info: (m, meta) => log("info", m, meta),
    debug: (m, meta) => log("debug", m, meta),
};
