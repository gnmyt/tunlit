import "./styles.sass";
import { useEffect, useState } from "react";
import { DialogProvider } from "@/common/components/Dialog";
import Loading from "@/common/components/Loading";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { formatBytes } from "@/common/utils/formatUtils.js";
import { BodyView } from "./BodyView.jsx";

export const RequestDialog = ({ tunnelId, entry, onClose }) => {
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!entry) return;
        setDetail(null);
        setError(null);
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
                </div>
                <div className="request-dialog-meta">
                    {entry && new Date(entry.time).toLocaleString()} · {entry?.duration}ms · {entry?.ip}
                </div>

                {!detail && !error && <Loading />}
                {error && <p className="request-dialog-error">{error}</p>}

                {detail && (
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
