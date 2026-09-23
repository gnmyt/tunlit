import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import Loading from "@/common/components/Loading";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import Button from "@/common/components/Button";
import TunnelItem from "./components/TunnelItem";
import EmptyState from "./components/EmptyState";
import ReserveDialog from "./components/ReserveDialog";
import { Bookmark } from "lucide-react";

const POLL_INTERVAL = 3000;

export const Tunnels = () => {
    const { sendToast } = useToast();
    const [data, setData] = useState(null);
    const [persistent, setPersistent] = useState([]);
    const [reserving, setReserving] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const load = useCallback(async () => {
        try {
            const [live, saved] = await Promise.all([getRequest("tunnels"), getRequest("persistent")]);
            setData(live);
            setPersistent(saved.tunnels);
            setNow(Date.now());
        } catch (error) {
            if (error.code !== 401) sendToast("Error", "Could not load tunnels");
        }
    }, [sendToast]);

    useEffect(() => {
        load();
        const poll = setInterval(load, POLL_INTERVAL);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(poll); clearInterval(tick); };
    }, [load]);

    const tunnels = data?.tunnels || [];
    const online = tunnels.filter(tunnel => tunnel.online).length;
    const dormant = persistent.filter(entry => !entry.live).map(entry => ({
        id: entry.name, mode: "http", url: entry.url, online: false, persistent: true, dormant: true,
        owner: entry.owner, access: entry.access, domains: entry.domains,
    }));

    return (
        <div className="page">
            <ReserveDialog open={reserving} setOpen={setReserving} onReserved={load} />
            <div className="page-title">
                <h1>Tunnels</h1>
                <div className="page-title-side">
                    {data && <span className="page-title-meta">{online} of {tunnels.length} online</span>}
                    <Button type="secondary" icon={Bookmark} text="Reserve a name" onClick={() => setReserving(true)} />
                </div>
            </div>
            {!data && <Loading />}
            {data && (tunnels.length + dormant.length === 0
                ? <EmptyState />
                : <div className="tunnel-list">
                    {tunnels.map(tunnel => <TunnelItem key={tunnel.id} tunnel={tunnel} now={now} />)}
                    {dormant.map(tunnel => <TunnelItem key={`saved-${tunnel.id}`} tunnel={tunnel} now={now} />)}
                </div>)}
        </div>
    );
};
