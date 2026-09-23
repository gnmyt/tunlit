import "./styles.sass";
import { useEffect, useState } from "react";
import { DialogProvider } from "@/common/components/Dialog";
import Loading from "@/common/components/Loading";
import Button from "@/common/components/Button";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { useToast } from "@/common/contexts/toast.js";
import { Pencil, RotateCcw } from "lucide-react";
import { BodyView } from "./BodyView.jsx";
import { RequestEdit } from "./RequestEdit.jsx";

export const RequestDialog = ({ tunnelId, entry, onClose }) => {
    const { sendToast } = useToast();
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);
    const [replaying, setReplaying] = useState(false);
    const [editing, setEditing] = useState(false);

    const replay = async (changes = {}) => {
        setReplaying(true);
        try {
            const result = await postRequest(`tunnels/${tunnelId}/requests/${entry.id}/replay`, changes);
            sendToast("Success", result.message);
            setEditing(false);
        } catch (failure) {
            sendToast("Error", failure.message);
        } finally {
            setReplaying(false);
        }
    };

    useEffect(() => {
        if (!entry) return;
        setDetail(null);
        setError(null);
        setEditing(false);
        getRequest(`tunnels/${tunnelId}/requests/${entry.id}`)
            .then(data => setDetail(data.request))
            .catch(failure => setError(failure.message));
    }, [tunnelId, entry]);

    return (
        <DialogProvider open={!!entry} onClose={onClose}>
            <div className="request-dialog">
                <div className="request-dialog-head">
                    <span className="request-method">{entry?.kind === "ws" ? "WS" : entry?.method}</span>
                    <span className="request-path" title={entry?.path}>{entry?.path}</span>
                    <span className="request-status">{entry?.status}</span>
                    {entry?.kind !== "ws" && !editing && <>
                        <Button type="ghost" icon={Pencil} text="Edit" buttonType="button" onClick={() => setEditing(true)}
                                disabled={!detail} />
                        <Button type="ghost" icon={RotateCcw} text="Replay" buttonType="button" onClick={() => replay()}
                                disabled={replaying || !detail || detail.request.truncated} />
                    </>}
                </div>
                <div className="request-dialog-meta">
                    {entry && new Date(entry.time).toLocaleString()} · {entry?.duration}ms · {entry?.ip}
                </div>

                {!detail && !error && <Loading />}
                {error && <p className="request-dialog-error">{error}</p>}

                {detail && editing && (
                    <RequestEdit entry={entry} detail={detail} busy={replaying} onSend={replay} onCancel={() => setEditing(false)} />
                )}

                {detail && !editing && (
                    <div className="request-dialog-body">
                        <section>
                            <h3>Request <span>{formatBytes(detail.request.bytes)}</span></h3>
                            <HeaderTable headers={detail.request.headers} />
                            <BodyView part={detail.request} headers={detail.request.headers} />
                        </section>
                        <section>
                            <h3>Response <span>{formatBytes(detail.response.bytes)}</span></h3>
                            <HeaderTable headers={detail.response.headers} />
                            <BodyView part={detail.response} headers={detail.response.headers} />
                        </section>
                    </div>
                )}
            </div>
        </DialogProvider>
    );
};

const HeaderTable = ({ headers }) => {
    if (!headers.length) return null;
    return (
        <dl className="request-headers">
            {headers.map(([name, value], index) => (
                <div key={`${name}-${index}`}>
                    <dt>{name}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
};
