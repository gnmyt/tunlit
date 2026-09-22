import "./styles.sass";
import { useState } from "react";
import Input from "@/common/components/Input";
import Button from "@/common/components/Button";
import { postRequest } from "@/common/utils/RequestUtil.js";

export const Gate = ({ id, auth }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const needsAccount = auth === "tunlit";

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await postRequest(`gate/${encodeURIComponent(id)}`, needsAccount ? { username, password } : { password });
            window.location.reload();
        } catch (failure) {
            setError(failure.message || "That did not work");
            setBusy(false);
        }
    };

    return (
        <form className="gate" onSubmit={submit}>
            <div className="form-head">
                <h1>Protected tunnel.</h1>
                <p>{needsAccount
                    ? <>Sign in with your tunlit account to reach <code>{id}</code>.</>
                    : <>Enter the password for <code>{id}</code>.</>}</p>
            </div>
            <div className="form-body">
                {needsAccount && <Input id="gate-username" label="Username" value={username} setValue={setUsername}
                                        autoFocus autoComplete="username" />}
                <Input id="gate-password" label="Password" type="password" value={password} setValue={setPassword}
                       autoFocus={!needsAccount} autoComplete="current-password" />
                {error && <p className="gate-error">{error}</p>}
            </div>
            <div className="form-actions">
                <div className="spacer" />
                <Button text={busy ? "Checking…" : "Continue"} buttonType="submit"
                        disabled={busy || !password || (needsAccount && !username)} />
            </div>
        </form>
    );
};
