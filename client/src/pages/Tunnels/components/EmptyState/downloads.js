const BASE = "https://github.com/gnmyt/tunlit/releases/latest/download";

export const RELEASES_URL = "https://github.com/gnmyt/tunlit/releases/latest";

export const DOWNLOADS = [
    { key: "linux-x64", title: "Linux (x64)", file: "tunlit-linux-x64" },
    { key: "linux-arm64", title: "Linux (arm64)", file: "tunlit-linux-arm64" },
    { key: "macos-arm64", title: "macOS (Apple silicon)", file: "tunlit-macos-arm64" },
    { key: "macos-x64", title: "macOS (Intel)", file: "tunlit-macos-x64" },
    { key: "windows-x64", title: "Windows (x64)", file: "tunlit-windows-x64.exe" },
].map(entry => ({ ...entry, url: `${BASE}/${entry.file}` }));

export const detectPlatform = () => {
    const agent = navigator.userAgent;
    const arm = /arm|aarch64/i.test(navigator.userAgentData?.platform || agent);
    if (/windows/i.test(agent)) return "windows-x64";
    if (/mac os|macintosh/i.test(agent)) return arm || navigator.maxTouchPoints > 1 ? "macos-arm64" : "macos-x64";
    if (/linux|android/i.test(agent)) return arm ? "linux-arm64" : "linux-x64";
    return null;
};
