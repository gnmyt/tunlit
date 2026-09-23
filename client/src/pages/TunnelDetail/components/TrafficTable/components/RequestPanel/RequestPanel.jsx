import "./styles.sass";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Pencil, RotateCcw, X } from "lucide-react";
import Button from "@/common/components/Button";
import CopyButton from "@/common/components/CopyButton";
import Flag from "@/common/components/Flag";
import { countryName } from "@/common/utils/country.js";
import Loading from "@/common/components/Loading";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { copyToClipboard } from "@/common/utils/clipboard.js";
import { statusClass } from "../../format.js";
import { BodyView } from "./BodyView.jsx";
import { RequestEdit } from "./RequestEdit.jsx";
import { FramesView } from "./FramesView.jsx";
import { decode } from "./body.js";

const header = (list, name) => list.find(([key]) => key.toLowerCase() === name)?.[1];

const curlFor = (url, detail) => {
    const parts = [`curl -X ${detail.method} '${url}'`];
    for (const [name, value] of detail.request.headers) {
        if (!["host", "content-length"].includes(name.toLowerCase())) parts.push(`-H '${name}: ${value}'`);
    }
    const body = detail.request.body && decode(detail.request.body);
    if (body) parts.push(`--data-raw '${body.replace(/'/g, "'\\''")}'`);
    return parts.join(" \\\n  ");
};

const rawFor = (detail, part) => {
    const line = part === "request" ? `${detail.method} ${detail.path} HTTP/1.1` : `HTTP/1.1 ${detail.status}`;
    return [line, ...detail[part].headers.map(([name, value]) => `${name}: ${value}`)].join("\n");
};

const Card = ({ title, aside, children }) => (
    <div className="panel-card">
        <div className="panel-card-head"><h3>{title}</h3>{aside && <span>{aside}</span>}</div>
        {children}
    </div>
);

const Rows = ({ items }) => (
    <dl className="panel-rows">
        {items.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value, copy], index) => (
            <div key={index}>
                <dt>{label}</dt>
                <dd>{value}{copy && <CopyButton value={copy} />}</dd>
            </div>
        ))}
    </dl>
);

const Headers = ({ headers }) => (
    <Card title="Headers" aside={headers.length}>
        {headers.length > 0 && <Rows items={headers.map(([name, value]) => [name, <span key={name} className="mono">{value}</span>])} />}
    </Card>
);

const Intelligence = ({ intel, ip }) => {
    if (!intel || intel.private) {
        return (
            <Card title={intel ? "Private network" : "No data"}>
                <Rows items={[
                    ["Address", <span key="ip" className="mono">{intel?.ip || ip}</span>, intel?.ip || ip],
                    ["Location", intel ? "Not routed on the internet" : "Unknown"],
                ]} />
            </Card>
        );
    }
    const tags = [["tor", "Tor exit"], ["vpn", "VPN"], ["datacenter", "Datacenter"], ["blocklisted", "Blocklisted"]].filter(([key]) => intel[key]);
    return (
        <>
            <div className="panel-card">
                <div className="panel-country">
                    <Flag code={intel.country} size="lg" />
                    <div>
                        <strong>{intel.country ? countryName(intel.country) : "Unknown location"}</strong>
                        <span>{[intel.country, intel.continent, intel.eu && "EU"].filter(Boolean).join(" · ")}</span>
                    </div>
                    <div className="panel-tags">{tags.map(([key, label]) => <span key={key} className={`panel-tag ${key}`}>{label}</span>)}</div>
                </div>
                <Rows items={[
                    ["Address", <span key="ip" className="mono">{intel.ip}</span>, intel.ip],
                    ["ASN", intel.asn && <span key="asn" className="mono">AS{intel.asn}</span>],
                    ["Organization", intel.org],
                ]} />
            </div>
            <p className="panel-attribution"><a href="https://db-ip.com" target="_blank" rel="noreferrer">IP Geolocation by DB-IP</a></p>
        </>
    );
};

export const RequestPanel = ({ tunnelId, entry, onClose }) => {
    const { sendToast } = useToast();
    const { serverInfo } = useUser();
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("request");
    const [editing, setEditing] = useState(false);
    const [replaying, setReplaying] = useState(false);
    const ws = entry.kind === "ws";

    useEffect(() => {
        setDetail(null);
        setError(null);
        setEditing(false);
        setTab("request");
        getRequest(`tunnels/${tunnelId}/requests/${entry.id}`)
            .then(data => setDetail(data.request))
            .catch(failure => setError(failure.message));
    }, [tunnelId, entry.id]);

    useEffect(() => {
        document.body.classList.add("panel-open");
        return () => document.body.classList.remove("panel-open");
    }, []);

    useEffect(() => {
        const onKey = event => { if (event.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const replay = async (changes = {}) => {
        setReplaying(true);
        try {
            const result = await postRequest(`tunnels/${tunnelId}/requests/${entry.id}/replay`, changes);
            sendToast("Success", result.message);
            setEditing(false);
        } catch (failure) {
            sendToast("Error", failure.message);
        } finally {
            setReplaying(false);
        }
    };

    const scheme = serverInfo?.publicUrl?.startsWith("http://") ? "http" : "https";
    const url = `${scheme}://${entry.host}${entry.path}`;
    const intel = entry.intel;
    const tabs = [["request", "Request"], ws ? ["frames", "Messages"] : ["response", "Response"], ["intel", "IP Intelligence"]];

    return createPortal(
        <aside className="request-panel">
            <header className="panel-head">
                <span className="panel-method">{ws ? "WS" : entry.method}</span>
                <span className="panel-path" title={entry.path}>{entry.path}</span>
                <span className={`status ${statusClass(entry.status)}`}>{entry.status}</span>
                <div className="panel-actions">
                    {!ws && !editing && <>
                        <Button type="ghost" icon={Pencil} title="Edit and replay" onClick={() => setEditing(true)} disabled={!detail} />
                        <Button type="ghost" icon={RotateCcw} title="Replay" onClick={() => replay()}
                                disabled={replaying || !detail || detail.request.truncated} />
                    </>}
                    <Button type="ghost" icon={X} title="Close" onClick={onClose} />
                </div>
            </header>

            <div className="panel-scroll">
                {!detail && !error && <Loading />}
                {error && <p className="panel-error">{error}</p>}

                {detail && editing && (
                    <RequestEdit entry={entry} detail={detail} busy={replaying} onSend={replay} onCancel={() => setEditing(false)} />
                )}

                {detail && !editing && <>
                    <div className="panel-card">
                        <Rows items={[
                            ["URL", <a key="url" className="mono" href={url} target="_blank" rel="noreferrer">{url} <ExternalLink /></a>, url],
                            ["Status", <span key="status" className={`status ${statusClass(entry.status)}`}>{entry.status}</span>, String(entry.status)],
                            ["Duration", `${entry.duration} ms`],
                            ["Client", <span key="client" className="mono panel-client"><Flag code={intel?.country} />{entry.ip}</span>, entry.ip],
                            ["Network", intel?.private ? "Private network" : [intel?.org, intel?.country && countryName(intel.country)].filter(Boolean).join(" · ")],
                            ["Time", new Date(entry.time).toLocaleString()],
                        ]} />
                    </div>

                    <nav className="panel-tabs">
                        {tabs.map(([key, label]) => (
                            <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
                        ))}
                    </nav>

                    {tab === "request" && <>
                        <Card title="Summary">
                            <Rows items={[
                                ["Method", <span key="m" className="mono">{detail.method}</span>],
                                ["Path", <span key="p" className="mono">{detail.path}</span>, detail.path],
                                ["Content type", header(detail.request.headers, "content-type")],
                                ["Body", detail.request.bytes ? formatBytes(detail.request.bytes) : "none"],
                                ["Headers", detail.request.headers.length],
                            ]} />
                        </Card>
                        <Headers headers={detail.request.headers} />
                        <Card title="Body" aside={detail.request.bytes ? formatBytes(detail.request.bytes) : "No content"}>
                            {detail.request.bytes > 0 && <BodyView part={detail.request} headers={detail.request.headers} />}
                        </Card>
                        <Card title="Raw" aside={<Button type="ghost" text="Copy as curl" onClick={() => copyToClipboard(curlFor(url, detail)).then(() => sendToast("Success", "Copied"))} />}>
                            <pre className="panel-raw">{rawFor(detail, "request")}</pre>
                        </Card>
                    </>}

                    {tab === "response" && <>
                        <Card title="Summary">
                            <Rows items={[
                                ["Status", <span key="s" className={`status ${statusClass(detail.status)}`}>{detail.status}</span>],
                                ["Content type", header(detail.response.headers, "content-type")],
                                ["Body", detail.response.bytes ? formatBytes(detail.response.bytes) : "none"],
                                ["Headers", detail.response.headers.length],
                            ]} />
                        </Card>
                        <Headers headers={detail.response.headers} />
                        <Card title="Body" aside={detail.response.bytes ? formatBytes(detail.response.bytes) : "No content"}>
                            {detail.response.bytes > 0 && <BodyView part={detail.response} headers={detail.response.headers} />}
                        </Card>
                        <Card title="Raw"><pre className="panel-raw">{rawFor(detail, "response")}</pre></Card>
                    </>}

                    {tab === "frames" && <div className="panel-card"><FramesView tunnelId={tunnelId} entry={entry} /></div>}

                    {tab === "intel" && <Intelligence intel={intel} ip={entry.ip} />}
                </>}
            </div>
        </aside>,
        document.body,
    );
};
