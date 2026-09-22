import { formatRate } from "@/common/utils/formatUtils.js";

export const ChartTooltip = ({ active, payload, label, series }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;

    return (
        <div className="chart-tooltip">
            <span className="chart-tooltip-time">{new Date(label).toLocaleTimeString()}</span>
            {series.map(entry => (
                <span key={entry.key} className="chart-tooltip-row">
                    <i style={{ backgroundColor: entry.color }} />
                    {entry.label}
                    <b>{formatRate(point[entry.key])}</b>
                </span>
            ))}
            <span className="chart-tooltip-row muted">
                {point.requests} {point.requests === 1 ? "request" : "requests"}
            </span>
        </div>
    );
};
