import "./styles.sass";
import { FIELDS } from "@/common/components/QuotaFields";
import { formatBytes } from "@/common/utils/formatUtils.js";

const show = (key, value) => (key === "traffic" ? formatBytes(value) : value);

export const UsageSummary = ({ usage, limits }) => (
    <ul className="usage-summary">
        {FIELDS.map(({ key, label }) => (
            <li key={key}>
                <span className="usage-label">{label}</span>
                <span className="usage-value">
                    {show(key, usage[key])}
                    <span className="usage-limit">{limits[key] ? ` / ${show(key, limits[key])}` : ""}</span>
                </span>
            </li>
        ))}
    </ul>
);
