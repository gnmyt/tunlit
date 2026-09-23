import "./styles.sass";
import { useState } from "react";
import { DialogProvider } from "@/common/components/Dialog";
import Button from "@/common/components/Button";
import QuotaFields, { fromForm, toForm } from "@/common/components/QuotaFields";
import { useToast } from "@/common/contexts/toast.js";

export const LimitsDialog = ({ account, defaults, onClose, onSave }) => {
    const { sendToast } = useToast();
    const [values, setValues] = useState(() => toForm(account.quotas));
    const [busy, setBusy] = useState(false);

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        try {
            await onSave(fromForm(values));
            onClose();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogProvider open onClose={onClose}>
            <form className="limits" onSubmit={submit}>
                <div className="limits-head">
                    <h2>Limits for {account.username}.</h2>
                    <p>Empty fields use the defaults.</p>
                </div>
                <QuotaFields idPrefix="limits" values={values} setValues={setValues} placeholders={toForm(defaults)} />
                <div className="limits-actions">
                    <Button text="Cancel" type="secondary" onClick={onClose} buttonType="button" />
                    <Button text={busy ? "Saving..." : "Save"} buttonType="submit" disabled={busy} />
                </div>
            </form>
        </DialogProvider>
    );
};
