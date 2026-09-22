const REPOSITORY = "https://github.com/gnmyt/tunlit";

const PLATFORMS = { Windows: "windows", macOS: "macos", Linux: "linux" };

const appleSilicon = () => {
    try {
        const gl = document.createElement("canvas").getContext("webgl");
        const debug = gl?.getExtension("WEBGL_debug_renderer_info");
        const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
        return /apple\s*m\d|apple gpu/i.test(renderer);
    } catch {
        return false;
    }
};

const fromUserAgent = () => {
    const agent = navigator.userAgent;
    const os = /Windows/i.test(agent) ? "windows"
        : /Mac OS X|Macintosh/i.test(agent) ? "macos"
            : /Linux|X11/i.test(agent) ? "linux" : null;

    if (os === "macos") return { os, arch: appleSilicon() ? "arm64" : null };
    if (/arm64|aarch64/i.test(agent)) return { os, arch: "arm64" };
    if (/x86_64|x86-64|Win64|WOW64|x64/i.test(agent)) return { os, arch: "x64" };
    return { os, arch: null };
};

export const detectPlatform = async () => {
    const hints = navigator.userAgentData;
    if (hints?.getHighEntropyValues) {
        try {
            const high = await hints.getHighEntropyValues(["architecture", "bitness", "platform"]);
            const os = PLATFORMS[high.platform] || null;
            const arch = high.architecture === "arm" && high.bitness === "64" ? "arm64"
                : high.architecture === "x86" && high.bitness === "64" ? "x64" : null;
            if (os) return { os, arch: arch || fromUserAgent().arch };
        } catch {
            // Client hints can be refused by permissions policy; the user agent still answers.
        }
    }
    return fromUserAgent();
};

export const downloadsFor = ({ os, arch }, version) => {
    const all = version ? `${REPOSITORY}/releases/tag/v${version}` : `${REPOSITORY}/releases`;
    if (!version || !os) return { version, all, files: [] };

    const file = (name, label) => ({ url: `${REPOSITORY}/releases/download/v${version}/${name}`, label });

    if (os === "windows") {
        return { version, all, files: [
            file("tunlit-x64.msi", "Windows installer"),
            file("tunlit-windows-x64.exe", "Plain tunlit.exe"),
        ] };
    }

    if (os === "macos") {
        const silicon = file("tunlit-macos-arm64", "macOS, Apple Silicon");
        const intel = file("tunlit-macos-x64", "macOS, Intel");
        return { version, all, files: arch === "x64" ? [intel, silicon] : [silicon, intel] };
    }

    const onArm = arch === "arm64";
    return { version, all, files: [
        file(`tunlit-cli-${onArm ? "arm64" : "amd64"}.deb`, "Debian, Ubuntu"),
        file(`tunlit-cli-${onArm ? "aarch64" : "x86_64"}.rpm`, "Fedora, RHEL"),
        file(onArm ? "tunlit-linux-arm64" : "tunlit-linux-x64", "Plain binary"),
    ] };
};
