import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import Button from "@/common/components/Button";
import Gate from "@/pages/Gate";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { bindTab, readTab, rememberTab } from "@/common/utils/tunnelTab.js";

const POLL_INTERVAL = 2000;
const BIND_TIMEOUT = 2000;

export const Status = ({ kind, id, to, auth, ip }) => {
    const target = to || new URLSearchParams(window.location.search).get("to") || "/";
    const [failed, setFailed] = useState(false);
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        if (kind === "attach" || kind === "reattach") {
            const tunnel = kind === "attach" ? id : readTab();
            if (!tunnel) {
                window.location.replace("/@tunlit/select");
                return;
            }
            rememberTab(tunnel);
            let done = false;
            const go = () => {
                if (done) return;
                done = true;
                window.location.replace(target);
            };
            bindTab(tunnel).then(go).catch(() => setFailed(true));
            const timer = setTimeout(go, BIND_TIMEOUT);
            return () => clearTimeout(timer);
        }

        if (kind === "offline") {
            const timer = setInterval(async () => {
                try {
                    const status = await getRequest(`status/${encodeURIComponent(id)}`);
                    if (status.online) window.location.reload();
                    if (!status.exists) setFailed(true);
                } catch { /* keep waiting, the server may be restarting too */ }
            }, POLL_INTERVAL);
            return () => clearInterval(timer);
        }
    }, [kind, id, target]);

    if (kind === "gate") return <Gate id={id} auth={auth} />;

    if (kind === "blocked") {
        return (
            <div className="status-page">
                <div className="form-head">
                    <h1>Not allowed.</h1>
                    <p>This tunnel only accepts requests from certain addresses{ip ? <> and <code>{ip}</code> is not one of them</> : null}.</p>
                </div>
            </div>
        );
    }

    if (kind === "attach" || kind === "reattach") {
        return (
            <div className="status-page">
                <div className="form-head">
                    <h1>{failed ? "Could not open this tunnel." : "Opening…"}</h1>
                    <p>{failed
                        ? "This browser could not start the tunnel router. Path mode needs HTTPS or localhost."
                        : <>Attaching this tab to <code>{id || readTab()}</code>.</>}</p>
                </div>
                {failed && <div className="form-actions">
                    <Button text="Choose a tunnel" buttonType="button" onClick={() => window.location.replace("/@tunlit/select")} />
                </div>}
            </div>
        );
    }

    if (kind === "offline") {
        return (
            <div className="status-page">
                <div className="form-head">
                    <h1>{failed ? "Tunnel closed." : "Reconnecting…"}</h1>
                    <p>{failed
                        ? <>The tunnel <code>{id}</code> is gone.</>
                        : <>The client for <code>{id}</code> is disconnected. This page continues by itself once it is back.</>}</p>
                </div>
                <div className="status-wait">{!failed && <span className="status-spinner" />}</div>
            </div>
        );
    }

    return (
        <div className="status-page">
            <div className="form-head">
                <h1>Tunnel not found.</h1>
                <p>There is no tunnel called <code>{id}</code>. It may have been closed, or the id was mistyped.</p>
            </div>
            <div className="form-actions">
                <Button text="Choose a tunnel" buttonType="button" onClick={() => window.location.replace("/@tunlit/select")} />
            </div>
        </div>
    );
};
