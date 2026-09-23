import "./styles.sass";
import { useNavigate } from "react-router-dom";
import { formatCountdown, formatRelative } from "@/common/utils/formatUtils.js";
import { ChevronRight } from "lucide-react";
import { useUser } from "@/common/contexts/user.js";

export const TunnelItem = ({ tunnel, now }) => {
    const navigate = useNavigate();
    const { user } = useUser();
    const open = () => navigate(`/tunnels/${tunnel.id}`);
    const foreign = tunnel.owner && tunnel.owner !== user?.username;

    return (
        <button type="button" className={`tunnel-row${tunnel.online ? "" : " offline"}`} onClick={open}>
            <span className={`tunnel-dot${tunnel.online ? "" : " offline"}`} />
            <span className="tunnel-id">{tunnel.id}</span>
            {foreign && <span className="tunnel-owner">{tunnel.owner}</span>}
            <span className="tunnel-endpoint">{tunnel.url || `${tunnel.target} · tcp+udp`}</span>
            <span className="tunnel-spacer" />
            {tunnel.mode === "tcp"
                ? <span className="tunnel-meta">{tunnel.joiners} connected</span>
                : <span className="tunnel-meta">{tunnel.target}</span>}
            <span className="tunnel-time">
                {tunnel.online
                    ? formatRelative(tunnel.createdAt)
                    : tunnel.graceUntil ? formatCountdown(tunnel.graceUntil, now) : "offline"}
            </span>
            <ChevronRight className="tunnel-chevron" />
        </button>
    );
};
