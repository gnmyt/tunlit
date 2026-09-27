import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import Input from "@/common/components/Input";
import Button from "@/common/components/Button";
import Loading from "@/common/components/Loading";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { formValues, useAutofill } from "@/common/utils/autofill.js";

const PasswordGate = ({ id }) => {
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const formRef = useRef(null);

    useAutofill(formRef, filled => {
        if (filled["gate-password"]) setPassword(current => current || filled["gate-password"]);
    });

    const submit = async event => {
        event.preventDefault();
        const secret = formValues(event.currentTarget)["gate-password"] || password;
        setPassword(secret);
        setBusy(true);
        setError(null);
        try {
            await postRequest(`gate/${encodeURIComponent(id)}`, { password: secret });
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
                <p>Enter the password for <code>{id}</code>.</p>
            </div>
            <div className="form-body">
                <Input id="gate-password" label="Password" type="password" value={password} setValue={setPassword}
                       autoFocus autoComplete="current-password" />
                {error && <p className="gate-error">{error}</p>}
            </div>
            <div className="form-actions">
                <div className="spacer" />
                <Button text={busy ? "Checking…" : "Continue"} buttonType="submit" disabled={busy || !password} />
            </div>
        </form>
    );
};

export const Gate = ({ id, auth, authorize }) => {
    useEffect(() => {
        if (auth === "tunlit") window.location.replace(`${authorize}?return=${encodeURIComponent(window.location.href)}`);
    }, [auth, authorize]);

    return auth === "tunlit" ? <Loading /> : <PasswordGate id={id} />;
};
