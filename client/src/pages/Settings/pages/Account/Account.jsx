import { useEffect, useRef, useState } from "react";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import UsageSummary from "@/common/components/UsageSummary";
import { getRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { formValues, useAutofill } from "@/common/utils/autofill.js";
import TwoFactor from "./components/TwoFactor";
import Passkeys from "./components/Passkeys";

export const Account = () => {
    const { sendToast } = useToast();
    const { setUser } = useUser();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [saving, setSaving] = useState(false);
    const [quotas, setQuotas] = useState(null);
    const formRef = useRef(null);

    useEffect(() => {
        getRequest("quotas").then(setQuotas).catch(() => null);
    }, []);

    useAutofill(formRef, filled => {
        if (filled["current-password"]) setCurrentPassword(current => current || filled["current-password"]);
    });

    const submit = async event => {
        event.preventDefault();
        const filled = formValues(event.currentTarget);
        const current = filled["current-password"] || currentPassword;
        const next = filled["new-password"] || newPassword;
        setCurrentPassword(current);
        setNewPassword(next);
        if (next.length < 8) return sendToast("Error", "Password must be at least 8 characters");
        if (next !== (filled["confirm-password"] || confirm)) return sendToast("Error", "Passwords do not match");
        setSaving(true);
        try {
            await putRequest("settings/password", { currentPassword: current, newPassword: next });
            sendToast("Success", "Password changed");
            setUser(null);
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
        {quotas && (
            <section className="settings-panel">
                <div className="settings-head">
                    <h2>Usage</h2>
                </div>
                <UsageSummary usage={quotas.usage} limits={quotas.limits} />
            </section>
        )}
        <form className="settings-panel" onSubmit={submit} ref={formRef}>
            <div className="settings-head">
                <h2>Change password</h2>
            </div>
            <div className="settings-form">
                <Input id="current-password" type="password" label="Current" value={currentPassword}
                       setValue={setCurrentPassword} autoComplete="current-password" required />
                <div className="settings-form-row">
                    <Input id="new-password" type="password" label="New" value={newPassword} setValue={setNewPassword}
                           autoComplete="new-password" required />
                    <Input id="confirm-password" type="password" label="Confirm" value={confirm} setValue={setConfirm}
                           autoComplete="new-password" required />
                </div>
            </div>
            <div className="settings-actions">
                <div className="spacer" />
                <Button text={saving ? "Saving" : "Change password"} buttonType="submit" disabled={saving} />
            </div>
        </form>

        <section className="settings-panel">
            <div className="settings-head">
                <h2>Two-factor</h2>
                <p>A code from an authenticator app, on top of your password.</p>
            </div>
            <TwoFactor />
        </section>

        <section className="settings-panel">
            <div className="settings-head">
                <h2>Passkeys</h2>
                <p>Sign in with your fingerprint, face or security key instead of a password.</p>
            </div>
            <Passkeys />
        </section>
        </>
    );
};
