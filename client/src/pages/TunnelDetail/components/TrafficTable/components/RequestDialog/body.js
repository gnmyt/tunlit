export const decode = value => {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));
    } catch {
        return null;
    }
};
