import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "@/common/components/Button";
import CopyField from "@/common/components/CopyField";
import OpenInTunlit from "@/common/components/OpenInTunlit";
import Loading from "@/common/components/Loading";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import { deleteRequest, getRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { formatCountdown, formatRelative } from "@/common/utils/formatUtils.js";
import TrafficTable from "./components/TrafficTable";
import ClientList from "./components/ClientList";
import AccessSection from "./components/AccessSection";
import StatsPanel from "./components/StatsPanel";
import { ArrowLeft, ExternalLink, X } from "lucide-react";

const POLL_INTERVAL = 2000;

export const TunnelDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { sendToast } = useToast();
    const [data, setData] = useState(null);
    const [gone, setGone] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [closing, setClosing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(null);

    const load = useCallback(async () => {
        try {
            setData(await getRequest(`tunnels/${id}`));
            setNow(Date.now());
        } catch (error) {
            if (error.code === 404) setGone(true);
            else if (error.code !== 401) sendToast("Error", "Could not load the tunnel");
        }
    }, [id, sendToast]);

    useEffect(() => {
        load();
        const poll = setInterval(load, POLL_INTERVAL);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(poll); clearInterval(tick); };
    }, [load]);

    const close = async () => {
        try {
            await deleteRequest(`tunnels/${id}`);
            sendToast("Success", `Closed ${id}`);
            navigate("/tunnels");
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

    if (gone) {
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

    if (!data) return <div className="page"><Loading /></div>;

    const tunnel = data.tunnel;
    const isHttp = tunnel.mode !== "tcp";

    return (
        <div className="page">
            <ActionConfirmDialog open={closing} setOpen={setClosing} onConfirm={close}
                                 title={`Close ${tunnel.id}?`} text="The CLI and all visitors will be disconnected."
                                 confirmText="Close" />
            <ActionConfirmDialog open={!!disconnecting} setOpen={open => !open && setDisconnecting(null)}
                                 onConfirm={disconnect}
                                 title={disconnecting === "all" ? "Disconnect every client?" : `Disconnect ${disconnecting?.ip}?`}
                                 text="Their open connections drop immediately. They can connect again with the same share code."
                                 confirmText="Disconnect" />

            <button type="button" className="detail-back" onClick={() => navigate("/tunnels")}>
                <ArrowLeft />Tunnels
            </button>

            <header className="detail-head">
                <h1>{tunnel.url || tunnel.id}</h1>
                <div className="detail-actions">
                    {tunnel.url && <Button type="ghost" icon={ExternalLink} title="Open"
                                           onClick={() => window.open(tunnel.url, "_blank", "noopener")} />}
                    <Button type="danger" icon={X} title="Close tunnel" onClick={() => setClosing(true)} />
                </div>
            </header>

            <div className="detail-chips">
                <span className={`chip${tunnel.online ? " online" : " offline"}`}>
                    {tunnel.online ? "Online" : "Reconnecting"}
                </span>
                <span className="chip">{tunnel.mode}</span>
                <span className="chip mono">{tunnel.target}</span>
                {tunnel.access?.auth !== "none" && <span className="chip locked">
                    {tunnel.access.auth === "tunlit" ? "tunlit login" : "password"}
                </span>}
                {tunnel.access?.allowedIps?.length > 0 && <span className="chip locked">
                    {tunnel.access.allowedIps.length} allowed {tunnel.access.allowedIps.length === 1 ? "range" : "ranges"}
                </span>}
                <span className="detail-started">
                    Started {formatRelative(tunnel.createdAt)}
                    {!tunnel.online && tunnel.graceUntil && ` · closes in ${formatCountdown(tunnel.graceUntil, now)}`}
                </span>
            </div>

            <CopyField value={tunnel.url || tunnel.shareCode} secret={!tunnel.url} />

            {tunnel.shareCode && <div className="detail-open"><OpenInTunlit code={tunnel.shareCode} /></div>}

            <AccessSection tunnel={tunnel} onSaved={load} />

            <StatsPanel id={tunnel.id} />

            {isHttp
                ? <TrafficTable id={tunnel.id} />
                : <ClientList clients={tunnel.clients} port={tunnel.target.split(":").pop()}
                               onDisconnect={client => setDisconnecting(client)}
                               onDisconnectAll={() => setDisconnecting("all")} />}
        </div>
    );
};
