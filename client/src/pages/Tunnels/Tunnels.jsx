import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import Loading from "@/common/components/Loading";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import TunnelItem from "./components/TunnelItem";
import EmptyState from "./components/EmptyState";

const POLL_INTERVAL = 3000;

export const Tunnels = () => {
    const { sendToast } = useToast();
    const [data, setData] = useState(null);
    const [now, setNow] = useState(() => Date.now());

    const load = useCallback(async () => {
        try {
            setData(await getRequest("tunnels"));
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

    return (
        <div className="page">
            <div className="page-title">
                <h1>Tunnels</h1>
                {data && <span className="page-title-meta">{online} of {tunnels.length} online</span>}
            </div>
            {!data && <Loading />}
            {data && (tunnels.length === 0
                ? <EmptyState />
                : <div className="tunnel-list">
                    {tunnels.map(tunnel => <TunnelItem key={tunnel.id} tunnel={tunnel} now={now} />)}
                </div>)}
        </div>
    );
};
