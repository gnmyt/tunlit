import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Input from "@/common/components/Input";
import Button from "@/common/components/Button";
import Loading from "@/common/components/Loading";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useUser } from "@/common/contexts/user.js";

export const Handoff = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { user, loaded } = useUser();
    const code = (params.get("code") || "").toUpperCase();

    const [request, setRequest] = useState(null);
    const [name, setName] = useState("");
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!code) return setError("This link has no code in it.");
        try {
            const data = await getRequest(`devices/pending/${encodeURIComponent(code)}`);
            setRequest(data.request);
            setName(previous => previous || data.request.client || "");
        } catch (failure) {
            if (failure.code !== 401) setError(failure.message);
        }
    }, [code]);

    useEffect(() => {
        if (loaded && user) load();
    }, [loaded, user, load]);

    if (!loaded) return <Loading />;

    if (!user) {
        return (
            <div className="handoff">
                <div className="form-head">
                    <h1>Sign in first.</h1>
                    <p>Approving a device needs your tunlit account.</p>
                </div>
                <div className="form-actions">
                    <div className="spacer" />
                    <Button text="Sign in" buttonType="button"
                            onClick={() => navigate("/login", { state: { from: `/handoff?code=${encodeURIComponent(code)}` } })} />
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div className="handoff">
                <div className="form-head">
                    <h1>{done === "approved" ? "Device linked." : "Request denied."}</h1>
                    <p>{done === "approved"
                        ? "The CLI has its token and is ready to create tunnels."
                        : "Nothing was handed out. You can close this page."}</p>
                </div>
                <div className="form-actions">
                    <div className="spacer" />
                    <Button text="Go to tunnels" buttonType="button" onClick={() => navigate("/tunnels")} />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="handoff">
                <div className="form-head">
                    <h1>That code is gone.</h1>
                    <p>{error} Run <code>tunlit login</code> again to get a new one.</p>
                </div>
            </div>
        );
    }

    if (!request) return <Loading />;

    const act = async action => {
        setBusy(true);
        try {
            await postRequest(`devices/pending/${encodeURIComponent(code)}/${action}`, action === "approve" ? { name } : {});
            setDone(action === "approve" ? "approved" : "denied");
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="handoff">
            <div className="form-head">
                <h1>Link this device?</h1>
                <p>A tunlit CLI is asking to create tunnels on this server.</p>
            </div>

            <dl className="handoff-facts">
                <div><dt>Code</dt><dd className="mono">{request.code}</dd></div>
                <div><dt>From</dt><dd className="mono">{request.ip || "unknown"}</dd></div>
                <div><dt>Client</dt><dd>{request.userAgent || request.client}</dd></div>
            </dl>

            <div className="form-body">
                <Input id="handoff-name" label="Name it" placeholder="Laptop" value={name} setValue={setName} />
            </div>

            <div className="form-actions">
                <Button type="ghost" text="Deny" buttonType="button" onClick={() => act("deny")} disabled={busy} />
                <div className="spacer" />
                <Button text={busy ? "Linking…" : "Approve"} buttonType="button" onClick={() => act("approve")}
                        disabled={busy || !name.trim()} />
            </div>
        </div>
    );
};
