import "./styles.sass";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Fingerprint } from "lucide-react";
import Input from "@/common/components/Input";
import Button from "@/common/components/Button";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { passkeysSupported, signInWithPasskey } from "@/common/utils/webauthn.js";

export const Login = () => {
    const { sendToast } = useToast();
    const { user, setupRequired, login } = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const [params] = useSearchParams();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [needsCode, setNeedsCode] = useState(false);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getRequest("auth/providers").then(data => setProviders(data.providers)).catch(() => setProviders([]));
    }, []);

    useEffect(() => {
        const error = params.get("error");
        if (error) sendToast("Error", error);
    }, [params, sendToast]);

    if (setupRequired) return <Navigate to="/setup" replace />;
    if (user) return <Navigate to={location.state?.from || "/tunnels"} replace />;

    const done = async () => {
        await login();
        navigate(location.state?.from || "/tunnels", { replace: true });
    };

    const submit = async event => {
        event.preventDefault();
        setLoading(true);
        try {
            const result = await postRequest("auth/login", { username, password, code: needsCode ? code : undefined });
            if (result.totpRequired) {
                setNeedsCode(true);
                setCode("");
                return;
            }
            await done();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const withPasskey = async () => {
        setLoading(true);
        try {
            await signInWithPasskey(username || undefined);
            await done();
        } catch (error) {
            if (error.name !== "NotAllowedError") sendToast("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const withProvider = async provider => {
        try {
            const { url } = await postRequest(`auth/oidc/${provider.id}/start`);
            window.location.href = url;
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    return (
        <form className="login" onSubmit={submit}>
            <div className="form-head">
                <h1>{needsCode ? "One more step." : "Welcome back."}</h1>
                {needsCode && <p>Enter the code from your authenticator app.</p>}
            </div>

            <div className="form-body">
                {needsCode ? (
                    <Input id="code" label="Code" value={code} setValue={setCode} inputMode="numeric"
                           autoComplete="one-time-code" autoFocus required />
                ) : (
                    <>
                        <Input id="username" label="Username" value={username} setValue={setUsername}
                               autoComplete="username" autoFocus required />
                        <Input id="password" type="password" label="Password" value={password} setValue={setPassword}
                               autoComplete="current-password" required />
                    </>
                )}
            </div>

            <div className="form-actions">
                {needsCode
                    ? <Button type="ghost" text="Back" buttonType="button" onClick={() => setNeedsCode(false)} />
                    : <div />}
                <div className="spacer" />
                <Button text={loading ? "Signing in" : "Sign in"} buttonType="submit" disabled={loading} />
            </div>

            {!needsCode && (passkeysSupported() || providers.length > 0) && (
                <div className="login-alternatives">
                    <span className="login-divider">or</span>
                    {passkeysSupported() && (
                        <Button type="secondary" icon={Fingerprint} text="Use a passkey" buttonType="button"
                                onClick={withPasskey} disabled={loading} />
                    )}
                    {providers.map(provider => (
                        <Button key={provider.id} type="secondary" text={`Continue with ${provider.name}`}
                                buttonType="button" onClick={() => withProvider(provider)} disabled={loading} />
                    ))}
                </div>
            )}
        </form>
    );
};
