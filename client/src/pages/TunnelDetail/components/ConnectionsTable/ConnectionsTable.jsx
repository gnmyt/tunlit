import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import Button from "@/common/components/Button";
import Flag from "@/common/components/Flag";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import { deleteRequest, getRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plug, Trash2, Unplug } from "lucide-react";
import ConnectionPanel from "./components/ConnectionPanel";
import { formatTime } from "../TrafficTable/format.js";
import { formatDuration } from "./format.js";

const POLL_INTERVAL = 1500;
const PAGE_SIZE = 50;
const COLUMNS = [["started", "Time"], ["ip", "Client"], [null, "Protocol"], [null, "From"], ["in", "In"], ["out", "Out"], [null, "Duration"], [null, "State"]];

export const ConnectionsTable = ({ tunnel, heading, onDisconnect, onDisconnectAll }) => {
    const { sendToast } = useToast();
    const [connections, setConnections] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [total, setTotal] = useState(0);
    const [now, setNow] = useState(0);
    const [page, setPage] = useState(0);
    const [clearing, setClearing] = useState(false);
    const [selected, setSelected] = useState(null);
    const [sort, setSort] = useState({ by: "started", order: "desc" });

    useEffect(() => setPage(0), [sort]);

    const load = useCallback(async () => {
        const query = new URLSearchParams({ offset: page * PAGE_SIZE, limit: PAGE_SIZE, sort: sort.by, order: sort.order });
        try {
            const data = await getRequest(`tunnels/${tunnel.id}/connections?${query}`);
            setTotal(data.total);
            setNow(data.now);
            setConnections(data.connections);
            setLoaded(true);
        } catch {
            return;
        }
    }, [tunnel.id, page, sort]);

    useEffect(() => {
        load();
        const poll = setInterval(load, POLL_INTERVAL);
        return () => clearInterval(poll);
    }, [load]);

    const clear = async () => {
        try {
            const result = await deleteRequest(`tunnels/${tunnel.id}/connections`);
            sendToast("Success", result.message);
            if (page === 0) load(); else setPage(0);
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const sortBy = key => setSort(current => ({ by: key, order: current.by === key && current.order === "desc" ? "asc" : "desc" }));
    const open = tunnel.clients.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const first = page * PAGE_SIZE + 1;
    const last = Math.min(total, (page + 1) * PAGE_SIZE);

    return (
        <section className="connections">
            {selected && <ConnectionPanel tunnelId={tunnel.id} entry={selected} onClose={() => setSelected(null)} />}
            <ActionConfirmDialog open={clearing} setOpen={setClearing} onConfirm={clear} title="Clear connection history?"
                                 text="Finished connections and their captured data are deleted. Open connections stay." confirmText="Clear" />
            <div className="connections-head">
                {heading}
                <span className="connections-count">{open} open · {total} total</span>
                <div className="connections-spacer" />
                {open > 0 && <Button type="ghost" icon={Unplug} text="Disconnect all" buttonType="button" onClick={onDisconnectAll} />}
                {total > 0 && <Button type="ghost" icon={Trash2} text="Clear" buttonType="button" onClick={() => setClearing(true)} />}
            </div>

            {loaded && connections.length === 0
                ? <div className="connections-empty">
                    <Plug size={20} />
                    <p>No connections yet.</p>
                </div>
                : <div className="connections-table">
                    <table>
                        <thead>
                            <tr>
                                {COLUMNS.map(([key, label]) => (
                                    <th key={label} className={key ? "sortable" : ""} onClick={() => key && sortBy(key)}>
                                        {label}
                                        {key && sort.by === key && (sort.order === "desc" ? <ArrowDown /> : <ArrowUp />)}
                                    </th>
                                ))}
                                <th aria-label="Actions" />
                            </tr>
                        </thead>
                        <tbody>
                            {connections.map(entry => {
                                const live = !entry.endedAt;
                                return (
                                    <tr key={entry.key} className={`${live ? "live" : ""}${selected?.key === entry.key ? " selected" : ""}`} tabIndex={0}
                                        onClick={() => setSelected(entry)} onKeyDown={event => event.key === "Enter" && setSelected(entry)}>
                                        <td className="mono dim">{formatTime(entry.startedAt)}</td>
                                        <td className="mono client"><Flag code={entry.intel.country} />{entry.ip}</td>
                                        <td className="protocol">
                                            <span className="protocol-name">{entry.detail?.name || entry.protocol.toUpperCase()}</span>
                                            {entry.detail?.info && <span className="protocol-info" title={entry.detail.info}>{entry.detail.info}</span>}
                                        </td>
                                        <td className="mono dim">{entry.client}</td>
                                        <td className="mono">{formatBytes(entry.bytesIn)}</td>
                                        <td className="mono">{formatBytes(entry.bytesOut)}</td>
                                        <td className="mono dim">{formatDuration((entry.endedAt || now) - entry.startedAt)}</td>
                                        <td>{live ? <span className="status ok">open</span> : <span className="dim">{entry.reason}</span>}</td>
                                        <td className="actions">
                                            {live && (
                                                <button type="button" title="Disconnect" aria-label="Disconnect"
                                                        onClick={event => { event.stopPropagation(); onDisconnect({ id: entry.joiner, ip: entry.ip }); }}><Unplug /></button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {total > PAGE_SIZE && (
                        <div className="connections-pages">
                            <span>{first}–{last} of {total}</span>
                            <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft /></button>
                            <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page"><ChevronRight /></button>
                        </div>
                    )}
                </div>}
        </section>
    );
};
