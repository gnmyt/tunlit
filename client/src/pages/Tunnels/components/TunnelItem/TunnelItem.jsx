import "./styles.sass";
import { useNavigate } from "react-router-dom";
import { formatCountdown, formatRelative } from "@/common/utils/formatUtils.js";
import { Bookmark, ChevronRight } from "lucide-react";
import { useUser } from "@/common/contexts/user.js";

export const TunnelItem = ({ tunnel, now }) => {
    const navigate = useNavigate();
    const { user } = useUser();
    const open = () => navigate(`/tunnels/${tunnel.id}`);
    const foreign = tunnel.owner && tunnel.owner !== user?.username;
    const count = tunnel.domains?.length || 0;
    const meta = tunnel.dormant ? (count ? `${count} ${count === 1 ? "domain" : "domains"}` : "")
        : tunnel.mode === "tcp" ? `${tunnel.joiners} connected` : tunnel.target;

    return (
        <button type="button" className={`tunnel-row${tunnel.online ? "" : " offline"}${tunnel.dormant ? " dormant" : ""}`} onClick={open}>
            <span className={`tunnel-dot${tunnel.online ? "" : tunnel.dormant ? " dormant" : " offline"}`} />
            <span className="tunnel-id">{tunnel.id}</span>
            {tunnel.persistent && <Bookmark className="tunnel-pin" aria-label="Persistent" />}
            {foreign && <span className="tunnel-owner">{tunnel.owner}</span>}
            <span className="tunnel-endpoint">{tunnel.url || `${tunnel.target} · tcp+udp`}</span>
            <span className="tunnel-spacer" />
            <span className="tunnel-meta">{meta}</span>
            <span className="tunnel-time">
                {tunnel.online
                    ? formatRelative(tunnel.createdAt)
                    : tunnel.graceUntil ? formatCountdown(tunnel.graceUntil, now) : "offline"}
            </span>
            <ChevronRight className="tunnel-chevron" />
        </button>
    );
};
