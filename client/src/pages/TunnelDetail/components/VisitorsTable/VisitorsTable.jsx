import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import Button from "@/common/components/Button";
import Flag from "@/common/components/Flag";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import { deleteRequest, getRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { countryName } from "@/common/utils/country.js";
import { formatRelative } from "@/common/utils/formatUtils.js";
import { ArrowDown, ArrowUp, Ban, ChevronLeft, ChevronRight, Search, ShieldCheck, Trash2, Users } from "lucide-react";

const POLL_INTERVAL = 1500;
const PAGE_SIZE = 50;
const COLUMNS = [["ip", "Visitor"], [null, "Location"], [null, "Network"], ["requests", "Requests"], ["blocked", "Blocked"], ["first", "First seen"], ["last", "Last seen"]];
const TAGS = ["tor", "vpn", "datacenter", "blocklisted"];
const REASONS = { address: "address", country: "country", tor: "Tor", vpn: "VPN", datacenter: "datacenter", blocklist: "blocklist" };

export const VisitorsTable = ({ tunnel, heading, onSaved, onInspect }) => {
    const { sendToast } = useToast();
    const [visitors, setVisitors] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [clearing, setClearing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sort, setSort] = useState({ by: "last", order: "desc" });
    const blockedIps = tunnel.access.block.ips;

    useEffect(() => setPage(0), [sort]);

    const load = useCallback(async () => {
        const query = new URLSearchParams({ offset: page * PAGE_SIZE, limit: PAGE_SIZE, sort: sort.by, order: sort.order });
        try {
            const data = await getRequest(`tunnels/${tunnel.id}/visitors?${query}`);
            setTotal(data.total);
            setVisitors(data.visitors);
            setLoaded(true);
        } catch {
            return;
        }
    }, [tunnel.id, page, sort]);

    useEffect(() => {
        load();
        if (page > 0) return;
        const poll = setInterval(load, POLL_INTERVAL);
        return () => clearInterval(poll);
    }, [load, page]);

    const clear = async () => {
        try {
            const result = await deleteRequest(`tunnels/${tunnel.id}/visitors`);
            sendToast("Success", result.message);
            if (page === 0) load(); else setPage(0);
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const toggleBlock = async ip => {
        const ips = blockedIps.includes(ip) ? blockedIps.filter(entry => entry !== ip) : [...blockedIps, ip];
        setBusy(true);
        try {
            await putRequest(`tunnels/${tunnel.id}/access`, { block: { ips } });
            sendToast("Success", blockedIps.includes(ip) ? `${ip} unblocked` : `${ip} blocked`);
            onSaved();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    const sortBy = key => setSort(current => ({ by: key, order: current.by === key && current.order === "desc" ? "asc" : "desc" }));
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const first = page * PAGE_SIZE + 1;
    const last = Math.min(total, (page + 1) * PAGE_SIZE);

    return (
        <section className="visitors">
            <ActionConfirmDialog open={clearing} setOpen={setClearing} onConfirm={clear} title="Clear all visitors?"
                                 text="The visitor history of this tunnel is deleted." confirmText="Clear" />
            <div className="visitors-head">
                {heading}
                <span className="visitors-count">{total} {total === 1 ? "visitor" : "visitors"}</span>
                <div className="visitors-spacer" />
                {total > 0 && <Button type="ghost" icon={Trash2} text="Clear" buttonType="button" onClick={() => setClearing(true)} />}
            </div>

            {loaded && visitors.length === 0
                ? <div className="visitors-empty">
                    <Users size={20} />
                    <p>No visitors yet.</p>
                </div>
                : <div className="visitors-table">
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
                            {visitors.map(visitor => {
                                const intel = visitor.intel;
                                const blocked = blockedIps.includes(visitor.ip);
                                return (
                                    <tr key={visitor.ip} className={blocked ? "blocked" : ""}>
                                        <td className="mono visitor"><Flag code={intel.country} />{visitor.ip}</td>
                                        <td className="dim">{intel.private ? "Private network" : intel.country ? countryName(intel.country) : "—"}</td>
                                        <td>
                                            <div className="network">
                                                <span>{intel.org || "—"}</span>
                                                {TAGS.filter(tag => intel[tag]).map(tag => <span key={tag} className={`panel-tag ${tag}`}>{tag}</span>)}
                                            </div>
                                        </td>
                                        <td className="mono">{visitor.requests}</td>
                                        <td className="mono">
                                            {visitor.blocked > 0
                                                ? <span className="visitor-blocked" title={`Last reason: ${REASONS[visitor.reason]}`}>{visitor.blocked}</span>
                                                : <span className="dim">0</span>}
                                        </td>
                                        <td className="dim">{formatRelative(visitor.firstSeen)}</td>
                                        <td className="dim">{formatRelative(visitor.lastSeen)}</td>
                                        <td className="actions">
                                            {onInspect && visitor.requests > 0 && (
                                                <button type="button" onClick={() => onInspect(visitor.ip)} title="Show requests" aria-label="Show requests"><Search /></button>
                                            )}
                                            {!intel.private && (
                                                <button type="button" className={blocked ? "unblock" : "block"} disabled={busy} onClick={() => toggleBlock(visitor.ip)}
                                                        title={blocked ? "Unblock" : "Block"} aria-label={blocked ? "Unblock" : "Block"}>
                                                    {blocked ? <ShieldCheck /> : <Ban />}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {total > PAGE_SIZE && (
                        <div className="visitors-pages">
                            <span>{first}–{last} of {total}</span>
                            <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft /></button>
                            <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page"><ChevronRight /></button>
                        </div>
                    )}
                </div>}
        </section>
    );
};
