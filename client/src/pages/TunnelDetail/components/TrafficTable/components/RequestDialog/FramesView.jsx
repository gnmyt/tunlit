import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { decode } from "./body.js";

const POLL_INTERVAL = 1500;
const OPCODES = { 1: "text", 2: "binary", 8: "close", 9: "ping", 10: "pong" };

const formatTime = time => new Date(time).toLocaleTimeString([], { hour12: false }) + "." + String(new Date(time).getMilliseconds()).padStart(3, "0");

const preview = frame => {
    if (!frame.payload) return "";
    const text = decode(frame.payload);
    return text === null ? `binary, ${formatBytes(frame.bytes)}` : text;
};

export const FramesView = ({ tunnelId, entry }) => {
    const [frames, setFrames] = useState([]);
    const [open, setOpen] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const latest = useRef(0);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const data = await getRequest(`tunnels/${tunnelId}/requests/${entry.id}/frames?after=${latest.current}`);
                if (!active) return;
                setOpen(data.open);
                if (!data.frames.length) return;
                latest.current = data.frames[data.frames.length - 1].id;
                setFrames(previous => [...previous, ...data.frames]);
            } catch {
                setOpen(false);
            }
        };
        load();
        const poll = setInterval(() => open && load(), POLL_INTERVAL);
        return () => { active = false; clearInterval(poll); };
    }, [tunnelId, entry.id, open]);

    return (
        <section>
            <h3>Frames <span>{frames.length}{open ? " · live" : ""}</span></h3>
            {frames.length === 0
                ? <p className="request-body-empty">{open ? "No frames yet" : "No frames"}</p>
                : <ul className="frames">
                    {frames.map(frame => (
                        <li key={frame.id} className={`frame ${frame.direction}${expanded === frame.id ? " expanded" : ""}`}
                            onClick={() => setExpanded(expanded === frame.id ? null : frame.id)}>
                            {frame.direction === "in" ? <ArrowUp /> : <ArrowDown />}
                            <span className="frame-kind">{OPCODES[frame.opcode] || frame.opcode}</span>
                            <span className="frame-payload">{preview(frame)}</span>
                            <span className="frame-meta">{formatBytes(frame.bytes)} · {formatTime(frame.time)}</span>
                        </li>
                    ))}
                </ul>}
        </section>
    );
};
