import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { formatBytes, formatRate } from "@/common/utils/formatUtils.js";
import { StatTile } from "./StatTile.jsx";
import { ChartTooltip } from "./ChartTooltip.jsx";

const POLL_INTERVAL = 2000;
const SERIES = [
    { key: "out", label: "Out", color: "var(--chart-out)" },
    { key: "in", label: "In", color: "var(--chart-in)" },
];

const clock = value => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const StatsPanel = ({ id }) => {
    const [stats, setStats] = useState(null);

    const load = useCallback(async () => {
        try {
            setStats((await getRequest(`tunnels/${id}/stats`)).stats);
        } catch { /* the tunnel may have closed while we were asking */ }
    }, [id]);

    useEffect(() => {
        load();
        const timer = setInterval(load, POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [load]);

    if (!stats) return null;

    const points = stats.buckets.map(bucket => ({
        t: bucket.t,
        out: Math.round(bucket.out / stats.interval),
        in: Math.round(bucket.in / stats.interval),
        requests: bucket.requests,
    }));
    const peak = points.reduce((most, point) => Math.max(most, point.in + point.out), 0);
    const quiet = peak === 0;

    return (
        <section className="stats">
            <div className="section-head">
                <h2>Live</h2>
                <span className="section-hint">{quiet ? "idle" : `peak ${formatRate(peak)}`}</span>
            </div>

            <div className="stats-panel">
                <div className="stats-tiles">
                    <StatTile label="Out now" value={formatRate(stats.rates.out)} accent="out" />
                    <StatTile label="In now" value={formatRate(stats.rates.in)} accent="in" />
                    <StatTile label="Sent" value={formatBytes(stats.totals.out)} />
                    <StatTile label="Received" value={formatBytes(stats.totals.in)} />
                    <StatTile label="Requests" value={stats.totals.requests.toLocaleString()} />
                </div>

                <figure className="stats-chart">
                    <figcaption>
                        <span>Throughput</span>
                        <div className="stats-legend">
                            {SERIES.map(series => (
                                <span key={series.key}>
                                    <i style={{ backgroundColor: series.color }} />{series.label}
                                </span>
                            ))}
                        </div>
                    </figcaption>

                    <div className="stats-chart-area">
                        <ResponsiveContainer width="100%" height={150}>
                            <AreaChart data={points} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
                                <defs>
                                    {SERIES.map(series => (
                                        <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={series.color} stopOpacity={0.35} />
                                            <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="t" tickFormatter={clock} tick={{ fill: "var(--muted)", fontSize: 10 }}
                                       axisLine={false} tickLine={false} minTickGap={48} />
                                <YAxis tickFormatter={formatRate} tick={{ fill: "var(--muted)", fontSize: 10 }}
                                       axisLine={false} tickLine={false} width={76} tickCount={4} />
                                <Tooltip content={<ChartTooltip series={SERIES} />} cursor={{ stroke: "var(--border-strong)" }} />
                                {SERIES.map(series => (
                                    <Area key={series.key} type="monotone" dataKey={series.key} stroke={series.color}
                                          strokeWidth={2} fill={`url(#fill-${series.key})`} isAnimationActive={false}
                                          dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                        {quiet && <p className="stats-quiet">Nothing has come through in the last few minutes.</p>}
                    </div>
                </figure>
            </div>
        </section>
    );
};
