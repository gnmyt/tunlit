const GB = 1e9;

export const FIELDS = [
    { key: "tunnels", label: "Tunnels" },
    { key: "persistent", label: "Persistent" },
    { key: "domains", label: "Domains" },
    { key: "traffic", label: "Traffic", suffix: "GB / month" },
];

export const toForm = limits => Object.fromEntries(FIELDS.map(({ key }) => {
    const value = limits?.[key];
    if (value === undefined || value === null) return [key, ""];
    return [key, String(key === "traffic" ? value / GB : value)];
}));

export const fromForm = values => Object.fromEntries(FIELDS.map(({ key }) => {
    const text = String(values[key] ?? "").trim();
    if (text === "") return [key, null];
    const number = Number(text);
    return [key, key === "traffic" ? Math.round(number * GB) : number];
}));
