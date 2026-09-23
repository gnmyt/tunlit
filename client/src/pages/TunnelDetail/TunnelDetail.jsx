import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "@/common/components/Button";
import CopyField from "@/common/components/CopyField";
import OpenInTunlit from "@/common/components/OpenInTunlit";
import Loading from "@/common/components/Loading";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import { deleteRequest, getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { formatCountdown, formatRelative } from "@/common/utils/formatUtils.js";
import TrafficTable from "./components/TrafficTable";
import VisitorsTable from "./components/VisitorsTable";
import ClientList from "./components/ClientList";
import AccessSection from "./components/AccessSection";
import DomainsSection from "./components/DomainsSection";
import StatsPanel from "./components/StatsPanel";
import { ArrowLeft, Bookmark, BookmarkX, ExternalLink, X } from "lucide-react";

const POLL_INTERVAL = 2000;

const stateOf = (live, now) => {
    if (!live) return ["dormant", "Offline"];
    if (live.online) return ["online", "Online"];
    return ["offline", `Reconnecting · closes in ${formatCountdown(live.graceUntil, now)}`];
};

export const TunnelDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { sendToast } = useToast();
    const [data, setData] = useState(null);
    const [definition, setDefinition] = useState(null);
    const [checked, setChecked] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [closing, setClosing] = useState(false);
    const [releasing, setReleasing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(null);
    const [view, setView] = useState("traffic");
    const [focus, setFocus] = useState("");

    const load = useCallback(async () => {
        try {
            setData(await getRequest(`tunnels/${id}`));
            setNow(Date.now());
        } catch (error) {
            if (error.code === 401) return;
            if (error.code !== 404) return sendToast("Error", "Could not load the tunnel");
            setData(null);
        }
    }, [id, sendToast]);

    const loadDefinition = useCallback(async () => {
        try {
            setDefinition((await getRequest(`persistent/${id}`)).tunnel);
        } catch (error) {
            if (error.code === 404) setDefinition(null);
        }
    }, [id]);

    useEffect(() => {
        const refresh = () => Promise.all([load(), loadDefinition()]).then(() => setChecked(true));
        refresh();
        const poll = setInterval(refresh, POLL_INTERVAL);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(poll); clearInterval(tick); };
    }, [load, loadDefinition]);

    const live = data?.tunnel || null;
    const persistent = live ? live.persistent : !!definition;

    const close = async () => {
        try {
            await deleteRequest(`tunnels/${id}`);
            sendToast("Success", `Closed ${id}`);
            if (!persistent) navigate("/tunnels");
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const keep = async () => {
        try {
            const result = await postRequest("persistent", { name: id });
            sendToast("Success", result.message);
            await load();
            await loadDefinition();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const release = async () => {
        try {
            const result = await deleteRequest(`persistent/${id}`);
            sendToast("Success", result.message);
            setDefinition(null);
            if (!live) navigate("/tunnels");
            else load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const disconnect = async () => {
        const path = disconnecting === "all" ? `tunnels/${id}/clients` : `tunnels/${id}/clients/${disconnecting.id}`;
        try {
            const result = await deleteRequest(path);
            sendToast("Success", result.message);
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    if (checked && !live && !definition) {
        return (
            <div className="page">
                <div className="detail-gone">
                    <h1>Tunnel closed.</h1>
                    <p>There is no tunnel called <code>{id}</code> any more.</p>
                    <Button text="Back to tunnels" buttonType="button" onClick={() => navigate("/tunnels")} />
                </div>
            </div>
        );
    }

    if (!live && !definition) return <div className="page"><Loading /></div>;

    const tunnel = live || {
        id: definition.name,
        mode: "http",
        url: definition.url,
        online: false,
        access: definition.access,
        persistent: true,
    };
    const isHttp = tunnel.mode !== "tcp";
    const heading = (
        <div className="detail-views" role="tablist">
            <button type="button" role="tab" aria-selected={view === "traffic"} className={view === "traffic" ? "active" : ""}
                    onClick={() => setView("traffic")}>{isHttp ? "Traffic" : "Clients"}</button>
            <button type="button" role="tab" aria-selected={view === "visitors"} className={view === "visitors" ? "active" : ""}
                    onClick={() => setView("visitors")}>Visitors</button>
        </div>
    );
    const domains = definition?.domains || [];
    const [state, stateLabel] = stateOf(live, now);

    return (
        <div className="page">
            <ActionConfirmDialog open={closing} setOpen={setClosing} onConfirm={close}
                                 title={`Close ${tunnel.id}?`} text="The CLI and all visitors will be disconnected."
                                 confirmText="Close" />
            <ActionConfirmDialog open={releasing} setOpen={setReleasing} onConfirm={release}
                                 title={`Release ${tunnel.id}?`}
                                 text="The name becomes free again and its domains are removed."
                                 confirmText="Release" />
            <ActionConfirmDialog open={!!disconnecting} setOpen={open => !open && setDisconnecting(null)}
                                 onConfirm={disconnect}
                                 title={disconnecting === "all" ? "Disconnect every client?" : `Disconnect ${disconnecting?.ip}?`}
                                 text="Their open connections drop immediately. They can connect again with the same share code."
                                 confirmText="Disconnect" />

            <button type="button" className="detail-back" onClick={() => navigate("/tunnels")}>
                <ArrowLeft />Tunnels
            </button>

            <header className="detail-head">
                <div className="detail-heading">
                    <h1>{tunnel.id}{persistent && <Bookmark className="detail-pin" aria-label="Persistent" />}</h1>
                    <p className="detail-sub">
                        <span className={`detail-dot ${state}`} />
                        {stateLabel}
                        {live && <span className="mono"> · {tunnel.target}</span>}
                        {live && ` · started ${formatRelative(tunnel.createdAt)}`}
                    </p>
                </div>
                <div className="detail-actions">
                    {live && tunnel.url && <Button type="ghost" icon={ExternalLink} title="Open"
                                                   onClick={() => window.open(tunnel.url, "_blank", "noopener")} />}
                    {persistent
                        ? <Button type="ghost" icon={BookmarkX} title="Release this name" onClick={() => setReleasing(true)} />
                        : <Button type="ghost" icon={Bookmark} title="Keep this name" onClick={keep} />}
                    {live && <Button type="danger" icon={X} title="Close tunnel" onClick={() => setClosing(true)} />}
                </div>
            </header>

            {live
                ? <CopyField value={tunnel.url || tunnel.shareCode} secret={!tunnel.url} />
                : <CopyField value={`tunlit http 3000 --name ${tunnel.id}`} />}

            {live?.shareCode && <div className="detail-open"><OpenInTunlit code={tunnel.shareCode} /></div>}

            <AccessSection tunnel={tunnel} onSaved={() => { load(); loadDefinition(); }}
                           endpoint={live ? `tunnels/${tunnel.id}/access` : `persistent/${tunnel.id}/access`} />

            {persistent && isHttp && <DomainsSection name={tunnel.id} domains={domains} onChanged={loadDefinition} />}

            {live && <StatsPanel id={tunnel.id} />}

            {live && (view === "visitors"
                ? <VisitorsTable tunnel={tunnel} heading={heading} onSaved={load}
                                 onInspect={isHttp ? ip => { setFocus(ip); setView("traffic"); } : null} />
                : isHttp
                    ? <TrafficTable id={tunnel.id} heading={heading} focus={focus} />
                    : <ClientList clients={tunnel.clients} port={tunnel.target.split(":").pop()} heading={heading}
                                  onDisconnect={client => setDisconnecting(client)}
                                  onDisconnectAll={() => setDisconnecting("all")} />)}
        </div>
    );
};
