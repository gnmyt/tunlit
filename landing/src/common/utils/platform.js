export const detectOs = () => {
    const platform = navigator.userAgentData?.platform || navigator.userAgent;
    if (/Windows/i.test(platform)) return "windows";
    if (/Mac/i.test(platform)) return "macos";
    if (/Linux|X11/i.test(platform)) return "linux";
    return null;
};
