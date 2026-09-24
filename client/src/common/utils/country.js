const names = new Intl.DisplayNames(["en"], { type: "region" });
const flags = import.meta.glob("/node_modules/flag-icons/flags/4x3/*.svg", { eager: true, import: "default", query: "?url" });

export const countryName = code => {
    try {
        return names.of(code);
    } catch {
        return code;
    }
};

export const countryCodes = Object.keys(flags)
    .map(path => path.slice(path.lastIndexOf("/") + 1, -4).toUpperCase())
    .filter(code => /^[A-Z]{2}$/.test(code) && countryName(code) !== code)
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
