import "./styles.sass";
import { countryName } from "@/common/utils/country.js";

const flags = import.meta.glob("/node_modules/flag-icons/flags/4x3/*.svg", { eager: true, import: "default", query: "?url" });

const urlFor = code => flags[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`];

export const Flag = ({ code, size = "sm" }) => {
    const url = code && urlFor(code);
    if (!url) return null;
    return <img className={`flag flag-${size}`} src={url} alt={code} title={countryName(code)} draggable={false} />;
};
