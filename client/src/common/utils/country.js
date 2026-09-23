const names = new Intl.DisplayNames(["en"], { type: "region" });

export const countryName = code => {
    try {
        return names.of(code);
    } catch {
        return code;
    }
};
