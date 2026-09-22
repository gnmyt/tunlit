const toMillis = value => (typeof value === "string" ? Date.parse(value) : value);

export const formatRelative = timestamp => {
    const seconds = Math.round((Date.now() - toMillis(timestamp)) / 1000);
    if (!Number.isFinite(seconds)) return "unknown";
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
};

export const formatCountdown = (until, now = Date.now()) => {
    const seconds = Math.max(0, Math.ceil((until - now) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const UNITS = ["B", "kB", "MB", "GB", "TB"];

export const formatBytes = bytes => {
    let value = Number(bytes) || 0;
    let unit = 0;
    while (value >= 1000 && unit < UNITS.length - 1) {
        value /= 1000;
        unit += 1;
    }
    const rounded = unit === 0 ? Math.round(value) : value.toFixed(value < 10 ? 1 : 0);
    return `${rounded} ${UNITS[unit]}`;
};

export const formatRate = bytesPerSecond => `${formatBytes(bytesPerSecond)}/s`;
