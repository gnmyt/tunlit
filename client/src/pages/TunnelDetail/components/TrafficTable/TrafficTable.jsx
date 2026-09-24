import "./styles.sass";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/common/components/Button";
import Flag from "@/common/components/Flag";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import { deleteRequest, getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { Activity, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CirclePause, Download, Pause, Play, Search, Trash2, X } from "lucide-react";
import RequestPanel from "./components/RequestPanel";
import BreakpointsBar, { PhaseIcon } from "./components/BreakpointsBar";
import { formatTime, statusClass } from "./format.js";
import { countryName } from "@/common/utils/country.js";

const POLL_INTERVAL = 1500;
const PAGE_SIZE = 50;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "WS"];
const STATUSES = [2, 3, 4, 5];
const COLUMNS = [["time", "Time"], ["client", "Client"], ["method", "Method"], ["path", "Path"], ["status", "Status"], ["duration", "Duration"]];
const EMPTY = { search: "", methods: [], statuses: [], countries: [] };

const rowClass = (...names) => names.filter(Boolean).join(" ");
const toggle = (list, value) => (list.includes(value) ? list.filter(entry => entry !== value) : [...list, value]);
const typing = () => {
    const active = document.activeElement;
    return active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable);
};

export const TrafficTable = ({ id, heading, focus }) => {
    const { sendToast } = useToast();
    const [clearing, setClearing] = useState(false);
    const [requests, setRequests] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [total, setTotal] = useState(0);
    const [countries, setCountries] = useState([]);
    const [page, setPage] = useState(0);
    const [paused, setPaused] = useState(false);
    const [selected, setSelected] = useState(null);
    const [filter, setFilter] = useState(EMPTY);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState({ by: "time", order: "desc" });
    const [breakpoints, setBreakpoints] = useState({ rules: [], held: [], now: 0 });
    const [showBreakpoints, setShowBreakpoints] = useState(false);
    const [cursor, setCursor] = useState(null);
    const keyState = useRef({});

    useEffect(() => {
        const timer = setTimeout(() => setFilter(current => ({ ...current, search: search.trim() })), 250);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => setPage(0), [filter, sort]);
    useEffect(() => { if (focus) setSearch(focus); }, [focus]);

    const load = useCallback(async () => {
        const query = new URLSearchParams({ offset: page * PAGE_SIZE, limit: PAGE_SIZE, sort: sort.by, order: sort.order });
        if (filter.search) query.set("search", filter.search);
        if (filter.methods.length) query.set("methods", filter.methods.join(","));
        if (filter.statuses.length) query.set("statuses", filter.statuses.join(","));
        if (filter.countries.length) query.set("countries", filter.countries.join(","));
        try {
            const data = await getRequest(`tunnels/${id}/requests?${query}`);
            setTotal(data.total);
            setCountries(data.countries);
            setRequests(data.requests);
            setLoaded(true);
        } catch {
            return;
        }
    }, [id, page, filter, sort]);

    useEffect(() => {
        load();
        if (paused || page > 0) return;
        const poll = setInterval(load, POLL_INTERVAL);
        return () => clearInterval(poll);
    }, [load, paused, page]);

    const loadBreakpoints = useCallback(async () => {
        try {
            setBreakpoints(await getRequest(`tunnels/${id}/breakpoints`));
        } catch {
            return;
        }
    }, [id]);

    useEffect(() => {
        loadBreakpoints();
        const poll = setInterval(loadBreakpoints, POLL_INTERVAL);
        return () => clearInterval(poll);
    }, [loadBreakpoints]);

    useEffect(() => {
        if (selected?.held && !breakpoints.held.some(entry => entry.id === selected.id)) setSelected(null);
    }, [breakpoints.held, selected]);

    const pick = entry => setSelected({ ...entry, held: true });

    useEffect(() => {
        keyState.current = { rows: [...breakpoints.held.map(entry => ({ ...entry, held: true })), ...requests], cursor, selected };
    }, [breakpoints.held, requests, cursor, selected]);

    useEffect(() => {
        const onKey = event => {
            if (event.altKey || event.ctrlKey || event.metaKey || typing()) return;
            const { rows, cursor, selected } = keyState.current;
            if (event.key === "j" || event.key === "k") {
                if (rows.length === 0) return;
                const at = rows.findIndex(entry => entry.id === (cursor ?? selected?.id));
                const next = event.key === "j" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
                setCursor(rows[next].id);
                if (selected) setSelected(rows[next]);
                document.querySelector(`.traffic-table tr[data-id="${rows[next].id}"]`)?.scrollIntoView({ block: "nearest" });
            } else if (event.key === "Enter" && cursor !== null) {
                const entry = rows.find(entry => entry.id === cursor);
                if (entry) setSelected(entry);
            } else if (event.key === "Escape") {
                setCursor(null);
            } else if (event.key === "r" && selected && !selected.held) {
                postRequest(`tunnels/${id}/requests/${selected.id}/replay`, {})
                    .then(result => sendToast("Success", result.message))
                    .catch(error => sendToast("Error", error.message));
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [id, sendToast]);

    const settle = async (held, input) => {
        try {
            const result = await postRequest(`tunnels/${id}/breakpoints/${held.id}`, input);
            sendToast("Success", result.message);
            setSelected(null);
            loadBreakpoints();
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const clear = async () => {
        try {
            const result = await deleteRequest(`tunnels/${id}/requests`);
            sendToast("Success", result.message);
            setSelected(null);
            if (page === 0) load(); else setPage(0);
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const sortBy = key => setSort(current => ({ by: key, order: current.by === key && current.order === "desc" ? "asc" : "desc" }));
    const filtering = filter.search || filter.methods.length > 0 || filter.statuses.length > 0 || filter.countries.length > 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const first = page * PAGE_SIZE + 1;
    const last = Math.min(total, (page + 1) * PAGE_SIZE);

    return (
        <section className="traffic">
            {selected && <RequestPanel tunnelId={id} entry={selected} onClose={() => setSelected(null)}
                                       onSettle={selected.held ? input => settle(selected, input) : null} />}
            <ActionConfirmDialog open={clearing} setOpen={setClearing} onConfirm={clear} title="Clear all requests?"
                                 text="The stored requests and messages of this tunnel are deleted." confirmText="Clear" />
            <div className="traffic-head">
                {heading}
                <span className="traffic-count">{total} {total === 1 ? "request" : "requests"}</span>
                <div className="traffic-spacer" />
                {total > 0 && <>
                    <a className="btn btn-ghost" href={`/@tunlit/api/tunnels/${id}/requests.har`} download={`${id}.har`}>
                        <Download /><span>Export HAR</span>
                    </a>
                    <Button type="ghost" icon={Trash2} text="Clear" buttonType="button" onClick={() => setClearing(true)} />
                </>}
                <Button type="ghost" icon={CirclePause} text={breakpoints.rules.length ? `Breakpoints · ${breakpoints.rules.length}` : "Breakpoints"}
                        buttonType="button" onClick={() => setShowBreakpoints(!showBreakpoints)} />
                <Button type="ghost" icon={paused ? Play : Pause} text={paused ? "Resume" : "Pause"}
                        buttonType="button" onClick={() => setPaused(!paused)} />
            </div>

            {showBreakpoints && <BreakpointsBar tunnelId={id} rules={breakpoints.rules} onChanged={loadBreakpoints} />}

            {loaded && (total > 0 || filtering) && (
                <div className="traffic-filters">
                    <label className="traffic-search">
                        <Search />
                        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Path or address" spellCheck={false} />
                        {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X /></button>}
                    </label>
                    <div className="traffic-chips">
                        {METHODS.map(method => (
                            <button key={method} type="button" className={filter.methods.includes(method) ? "active" : ""}
                                    onClick={() => setFilter({ ...filter, methods: toggle(filter.methods, method) })}>{method}</button>
                        ))}
                    </div>
                    <div className="traffic-chips">
                        {STATUSES.map(hundreds => (
                            <button key={hundreds} type="button" className={`${statusClass(hundreds * 100)}${filter.statuses.includes(hundreds) ? " active" : ""}`}
                                    onClick={() => setFilter({ ...filter, statuses: toggle(filter.statuses, hundreds) })}>{hundreds}xx</button>
                        ))}
                    </div>
                    {countries.length > 0 && (
                        <div className="traffic-chips traffic-countries">
                            {countries.map(({ code, count }) => (
                                <button key={code} type="button" className={filter.countries.includes(code) ? "active" : ""} title={countryName(code)}
                                        onClick={() => setFilter({ ...filter, countries: toggle(filter.countries, code) })}><Flag code={code} />{code}<small>{count}</small></button>
                            ))}
                        </div>
                    )}
                    {filtering && <Button type="ghost" text="Reset" buttonType="button" onClick={() => { setFilter(EMPTY); setSearch(""); }} />}
                </div>
            )}

            {loaded && requests.length === 0 && breakpoints.held.length === 0
                ? <div className="traffic-empty">
                    <Activity size={20} />
                    <p>{filtering ? "Nothing matches." : "No requests yet."}</p>
                </div>
                : <div className="traffic-table">
                    <table>
                        <thead>
                            <tr>
                                {COLUMNS.map(([key, label]) => (
                                    <th key={key} className={key === "client" ? "" : "sortable"} onClick={() => key !== "client" && sortBy(key)}>
                                        {label}
                                        {sort.by === key && (sort.order === "desc" ? <ArrowDown /> : <ArrowUp />)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {breakpoints.held.map(entry => (
                                <tr key={entry.id} data-id={entry.id} className={rowClass("held", selected?.id === entry.id && "selected", cursor === entry.id && "cursor")}
                                    onClick={() => pick(entry)}>
                                    <td className="mono dim">{formatTime(entry.time)}</td>
                                    <td className="mono client">{entry.ip}</td>
                                    <td className="mono"><PhaseIcon phase={entry.phase} />{entry.method}</td>
                                    <td className="mono path" title={entry.path}>{entry.path}</td>
                                    <td><span className="status warn">{entry.phase === "response" ? entry.status : "paused"}</span></td>
                                    <td className="mono dim">{Math.round((breakpoints.now - entry.time) / 1000)}s</td>
                                </tr>
                            ))}
                            {requests.map(entry => (
                                <tr key={entry.id} data-id={entry.id} className={rowClass(selected?.id === entry.id && "selected", cursor === entry.id && "cursor")}
                                    onClick={() => setSelected(entry)}>
                                    <td className="mono dim">{formatTime(entry.time)}</td>
                                    <td className="mono client"><Flag code={entry.intel?.country} />{entry.ip}</td>
                                    <td className="mono">{entry.kind === "ws" ? "WS" : entry.method}</td>
                                    <td className="mono path" title={entry.path}>{entry.path}</td>
                                    <td><span className={`status ${statusClass(entry.status)}`}>{entry.status}</span></td>
                                    <td className="mono dim">{entry.duration}ms</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {total > PAGE_SIZE && (
                        <div className="traffic-pages">
                            <span>{first}–{last} of {total}</span>
                            <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft /></button>
                            <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page"><ChevronRight /></button>
                        </div>
                    )}
                </div>}
        </section>
    );
};
