import "./styles.sass";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/common/components/Button";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { Activity, Pause, Play } from "lucide-react";
import RequestDialog from "./components/RequestDialog";

const POLL_INTERVAL = 1500;

const statusClass = status => {
    if (status >= 500) return "error";
    if (status >= 400) return "warn";
    if (status >= 300) return "info";
    if (status >= 200) return "ok";
    return "";
};

const formatTime = time => new Date(time).toLocaleTimeString([], { hour12: false })
    + "." + String(new Date(time).getMilliseconds()).padStart(3, "0");

export const TrafficTable = ({ id }) => {
    const [requests, setRequests] = useState([]);
    const [total, setTotal] = useState(0);
    const [paused, setPaused] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [selected, setSelected] = useState(null);
    const latest = useRef(0);

    const load = useCallback(async () => {
        try {
            const data = await getRequest(`tunnels/${id}/requests?after=${latest.current}`);
            setTotal(data.total);
            setLoaded(true);
            if (!data.requests.length) return;
            latest.current = Math.max(latest.current, ...data.requests.map(entry => entry.id));
            setRequests(previous => [...data.requests, ...previous].slice(0, 500));
        } catch { /* the poll retries, and the page above reports a tunnel that disappeared */ }
    }, [id]);

    useEffect(() => {
        if (paused) return;
        load();
        const poll = setInterval(load, POLL_INTERVAL);
        return () => clearInterval(poll);
    }, [load, paused]);

    return (
        <section className="traffic">
            <RequestDialog tunnelId={id} entry={selected} onClose={() => setSelected(null)} />
            <div className="traffic-head">
                <h2>Traffic</h2>
                <span className="traffic-count">{total} {total === 1 ? "request" : "requests"}</span>
                <div className="traffic-spacer" />
                <Button type="ghost" icon={paused ? Play : Pause} text={paused ? "Resume" : "Pause"}
                        buttonType="button" onClick={() => setPaused(!paused)} />
            </div>

            {loaded && requests.length === 0
                ? <div className="traffic-empty">
                    <Activity size={20} />
                    <p>No requests yet.</p>
                </div>
                : <div className="traffic-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Client IP</th>
                                <th>Method</th>
                                <th>Path</th>
                                <th>Status</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(entry => (
                                <tr key={entry.id} onClick={() => setSelected(entry)} tabIndex={0}
                                    onKeyDown={event => event.key === "Enter" && setSelected(entry)}>
                                    <td className="mono dim">{formatTime(entry.time)}</td>
                                    <td className="mono">{entry.ip || "-"}</td>
                                    <td className="mono">{entry.kind === "ws" ? "WS" : entry.method}</td>
                                    <td className="mono path" title={entry.path}>{entry.path}</td>
                                    <td><span className={`status ${statusClass(entry.status)}`}>{entry.status}</span></td>
                                    <td className="mono dim">{entry.duration}ms</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>}
        </section>
    );
};
