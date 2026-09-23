import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Send, Trash2 } from "lucide-react";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { formatTime } from "../../format.js";
import { decode } from "./body.js";

const POLL_INTERVAL = 1500;
const KEEP = 500;
const OPCODES = { 1: "text", 2: "binary", 8: "close", 9: "ping", 10: "pong" };
const FILTERS = [["all", "All"], ["in", "Received"], ["out", "Sent"]];

const describe = frame => {
    const text = frame.payload ? decode(frame.payload) : "";
    return { ...frame, kind: OPCODES[frame.opcode] || String(frame.opcode), text: text === null ? `binary, ${formatBytes(frame.bytes)}` : text };
};

export const FramesView = ({ tunnelId, entry }) => {
    const { sendToast } = useToast();
    const [frames, setFrames] = useState([]);
    const [draft, setDraft] = useState("");
    const [direction, setDirection] = useState("in");
    const [filter, setFilter] = useState("all");
    const [open, setOpen] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const latest = useRef(0);
    const list = useRef(null);
    const pinned = useRef(true);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const data = await getRequest(`tunnels/${tunnelId}/requests/${entry.id}/frames?after=${latest.current}`);
                if (!active) return;
                setOpen(data.open);
                if (!data.frames.length) return;
                latest.current = data.frames[data.frames.length - 1].id;
                setFrames(previous => [...previous, ...data.frames.map(describe)].slice(-KEEP));
            } catch {
                setOpen(false);
            }
        };
        load();
        if (!open) return () => { active = false; };
        const poll = setInterval(load, POLL_INTERVAL);
        return () => { active = false; clearInterval(poll); };
    }, [tunnelId, entry.id, open]);

    useEffect(() => {
        if (pinned.current && list.current) list.current.scrollTop = list.current.scrollHeight;
    }, [frames]);

    const onScroll = () => {
        const element = list.current;
        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 8;
    };

    const send = async event => {
        event.preventDefault();
        if (!draft) return;
        try {
            await postRequest(`tunnels/${tunnelId}/requests/${entry.id}/frames`, { direction, text: draft });
            setDraft("");
            pinned.current = true;
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const shown = filter === "all" ? frames : frames.filter(frame => frame.direction === filter);

    return (
        <>
            <div className="panel-card-head">
                <h3>Messages</h3>
                <div className="frame-tools">
                    {FILTERS.map(([key, label]) => (
                        <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>
                    ))}
                    <button type="button" onClick={() => setFrames([])} disabled={!frames.length} title="Clear" aria-label="Clear"><Trash2 /></button>
                </div>
                <span>{shown.length}{open ? " · live" : ""}</span>
            </div>
            {shown.length === 0
                ? <p className="request-body-empty">{open ? "No messages yet" : "No messages"}</p>
                : <ul className="frames" ref={list} onScroll={onScroll}>
                    {shown.map(frame => (
                        <li key={frame.id} className={`frame ${frame.direction}${expanded === frame.id ? " expanded" : ""}`}
                            onClick={() => setExpanded(expanded === frame.id ? null : frame.id)}>
                            {frame.direction === "in" ? <ArrowUp /> : <ArrowDown />}
                            <span className="frame-kind">{frame.kind}</span>
                            <span className="frame-payload">{frame.text}</span>
                            <span className="frame-meta">{formatBytes(frame.bytes)} · {formatTime(frame.time)}</span>
                        </li>
                    ))}
                </ul>}
            {open && (
                <form className="frame-send" onSubmit={send}>
                    <div className="frame-target" role="radiogroup" aria-label="Send to">
                        <button type="button" className={`in${direction === "in" ? " active" : ""}`} onClick={() => setDirection("in")}><ArrowUp />App</button>
                        <button type="button" className={`out${direction === "out" ? " active" : ""}`} onClick={() => setDirection("out")}><ArrowDown />Visitor</button>
                    </div>
                    <input value={draft} onChange={event => setDraft(event.target.value)} spellCheck={false}
                           placeholder={direction === "in" ? "Message to your app" : "Message to the visitor"} />
                    <button type="submit" className="frame-submit" disabled={!draft} aria-label="Send"><Send /></button>
                </form>
            )}
        </>
    );
};
