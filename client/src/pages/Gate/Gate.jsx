import "./styles.sass";
import { useRef, useState } from "react";
import Input from "@/common/components/Input";
import Button from "@/common/components/Button";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { formValues, useAutofill } from "@/common/utils/autofill.js";

export const Gate = ({ id, auth }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const formRef = useRef(null);

    const needsAccount = auth === "tunlit";

    useAutofill(formRef, filled => {
        if (filled["gate-username"]) setUsername(current => current || filled["gate-username"]);
        if (filled["gate-password"]) setPassword(current => current || filled["gate-password"]);
    });

    const submit = async event => {
        event.preventDefault();
        const filled = formValues(event.currentTarget);
        const identity = filled["gate-username"] || username;
        const secret = filled["gate-password"] || password;
        setUsername(identity);
        setPassword(secret);
        setBusy(true);
        setError(null);
        try {
            await postRequest(`gate/${encodeURIComponent(id)}`,
                needsAccount ? { username: identity, password: secret } : { password: secret });
            window.location.reload();
        } catch (failure) {
            setError(failure.message || "That did not work");
            setBusy(false);
        }
    };

    return (
        <form className="gate" onSubmit={submit} ref={formRef}>
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
