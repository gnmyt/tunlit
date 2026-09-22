import "./styles.sass";
import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import Button from "@/common/components/Button";
import CopyField from "@/common/components/CopyField";
import Input from "@/common/components/Input";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { QrCode } from "./QrCode.jsx";

export const TwoFactor = () => {
    const { sendToast } = useToast();
    const { user, setUser, login } = useUser();
    const [setup, setSetup] = useState(null);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);

    const start = async () => {
        try {
            setSetup(await getRequest("auth/totp/setup"));
            setCode("");
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const enable = async event => {
        event.preventDefault();
        setBusy(true);
        try {
            await postRequest("auth/totp/enable", { code });
            sendToast("Success", "Two-factor is on. Sign in again to continue.");
            setUser(null);
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    const disable = async event => {
        event.preventDefault();
        setBusy(true);
        try {
            await postRequest("auth/totp/disable", { code });
            sendToast("Success", "Two-factor is off");
            setCode("");
            await login();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    if (user?.totpEnabled) {
        return (
            <form className="two-factor" onSubmit={disable}>
                <div className="two-factor-state on">
                    <ShieldCheck size={16} />
                    <span>Your account asks for a code when you sign in.</span>
                </div>
                <div className="two-factor-row">
                    <Input id="totp-off" label="Code from your app" value={code} setValue={setCode}
                           inputMode="numeric" autoComplete="one-time-code" required />
                    <Button type="danger" text="Turn off" buttonType="submit" disabled={busy || code.length < 6} />
                </div>
            </form>
        );
    }

    return (
        <div className="two-factor">
            <div className="two-factor-state">
                <ShieldOff size={16} />
                <span>A password is all your account needs right now.</span>
            </div>

            {!setup && <Button type="secondary" text="Set up two-factor" onClick={start} />}

            {setup && (
                <form className="two-factor-setup" onSubmit={enable}>
                    <QrCode value={setup.url} />
                    <div className="two-factor-setup-body">
                        <p>Scan this with your authenticator app, or type the key in by hand.</p>
                        <CopyField value={setup.secret} secret />
                        <div className="two-factor-row">
                            <Input id="totp-on" label="Code from your app" value={code} setValue={setCode}
                                   inputMode="numeric" autoComplete="one-time-code" autoFocus required />
                            <Button text="Turn on" buttonType="submit" disabled={busy || code.length < 6} />
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
};
