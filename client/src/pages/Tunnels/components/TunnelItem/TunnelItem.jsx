import "./styles.sass";
import { useNavigate } from "react-router-dom";
import { formatCountdown, formatRelative } from "@/common/utils/formatUtils.js";
import { ArrowRight, Bookmark, ChevronRight } from "lucide-react";
import { useUser } from "@/common/contexts/user.js";

const status = (tunnel, now) => {
    if (tunnel.online) return formatRelative(tunnel.createdAt);
    if (tunnel.graceUntil) return `closes in ${formatCountdown(tunnel.graceUntil, now)}`;
    return "offline";
};

const detail = tunnel => {
    if (tunnel.mode === "tcp") return [tunnel.target, `tcp+udp · ${tunnel.joiners} connected`];
    if (tunnel.dormant) return [tunnel.url];
    return [tunnel.url, tunnel.target];
};

export const TunnelItem = ({ tunnel, now }) => {
    const navigate = useNavigate();
    const { user } = useUser();
    const state = tunnel.online ? "online" : tunnel.dormant ? "dormant" : "offline";
    const foreign = tunnel.owner && tunnel.owner !== user?.username;

    return (
        <button type="button" className={`tunnel-row ${state}`} onClick={() => navigate(`/tunnels/${tunnel.id}`)}>
            <span className="tunnel-dot" />
            <span className="tunnel-main">
                <span className="tunnel-title">
                    <span className="tunnel-id">{tunnel.id}</span>
                    {tunnel.persistent && <Bookmark className="tunnel-pin" aria-label="Persistent" />}
                    {foreign && <span className="tunnel-owner">{tunnel.owner}</span>}
                </span>
                <span className="tunnel-detail">
                    {detail(tunnel).map((part, index) => (
                        <span key={part} className="tunnel-detail-part">
                            {index > 0 && <ArrowRight />}
                            <span>{part}</span>
                        </span>
                    ))}
                </span>
            </span>
            <span className="tunnel-status">{status(tunnel, now)}</span>
            <ChevronRight className="tunnel-chevron" />
        </button>
    );
};
