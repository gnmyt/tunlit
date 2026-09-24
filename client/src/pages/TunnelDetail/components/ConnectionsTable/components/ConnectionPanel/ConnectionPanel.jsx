import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Button from "@/common/components/Button";
import CopyButton from "@/common/components/CopyButton";
import Flag from "@/common/components/Flag";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { countryName } from "@/common/utils/country.js";
import { formatDuration } from "../../format.js";

const POLL_INTERVAL = 1500;

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

export const ConnectionPanel = ({ tunnelId, entry, onClose }) => {
    const [connection, setConnection] = useState(entry);
    const [now, setNow] = useState(entry.endedAt || entry.startedAt);
    const open = !connection.endedAt;

    useEffect(() => {
        document.body.classList.add("panel-open");
        return () => document.body.classList.remove("panel-open");
    }, []);

    useEffect(() => {
        const onKey = event => { if (event.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const data = await getRequest(`tunnels/${tunnelId}/connections/${entry.key}`);
                if (!active) return;
                setConnection(data.connection);
                setNow(data.now);
            } catch {
                return;
            }
        };
        load();
        if (!open) return () => { active = false; };
        const poll = setInterval(load, POLL_INTERVAL);
        return () => { active = false; clearInterval(poll); };
    }, [tunnelId, entry.key, open]);

    const intel = connection.intel;
    const label = connection.detail ? `${connection.detail.name}${connection.detail.info ? ` · ${connection.detail.info}` : ""}` : connection.protocol.toUpperCase();

    return createPortal(
        <aside className="request-panel">
            <header className="panel-head">
                <span className="panel-method">{connection.protocol.toUpperCase()}</span>
                <span className="panel-path" title={connection.ip}>{connection.ip}</span>
                {open ? <span className="status ok">open</span> : <span className="status">{connection.reason}</span>}
                <div className="panel-actions">
                    <Button type="ghost" icon={X} title="Close" onClick={onClose} />
                </div>
            </header>
            <div className="panel-scroll">
                <div className="panel-card">
                    <Rows items={[
                        ["Client", <span key="client" className="mono panel-client"><Flag code={intel.country} />{connection.ip}</span>, connection.ip],
                        ["Network", intel.private ? "Private network" : [intel.org, intel.country && countryName(intel.country)].filter(Boolean).join(" · ")],
                        ["From", <span key="from" className="mono">{connection.client}</span>, connection.client],
                        ["Protocol", label],
                        ["Started", new Date(connection.startedAt).toLocaleString()],
                        ["Duration", formatDuration((connection.endedAt || now) - connection.startedAt)],
                        ["Received", formatBytes(connection.bytesIn)],
                        ["Sent", formatBytes(connection.bytesOut)],
                    ]} />
                </div>
            </div>
        </aside>,
        document.body,
    );
};
