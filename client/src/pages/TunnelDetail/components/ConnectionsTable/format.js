export const formatDuration = millis => {
    if (millis < 1000) return `${millis}ms`;
    if (millis < 60_000) return `${(millis / 1000).toFixed(1)}s`;
    const minutes = Math.floor(millis / 60_000);
    return `${minutes}m ${Math.round((millis % 60_000) / 1000)}s`;
};
