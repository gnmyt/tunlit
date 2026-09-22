import Button from "@/common/components/Button";
import ServerSettingsForm from "@/common/components/ServerSettingsForm";
import { useToast } from "@/common/contexts/toast.js";

export const ServerStep = ({ settings, setSettings, onBack, onNext, submitting }) => {
    const { sendToast } = useToast();

    const submit = event => {
        event.preventDefault();
        if (!settings.baseDomain.trim()) return sendToast("Error", "Base domain is required");
        onNext();
    };

    return (
        <form onSubmit={submit}>
            <div className="form-head">
                <h1>Server.</h1>
                <p>You can change all of this later.</p>
            </div>
            <ServerSettingsForm values={settings} setValues={setSettings} idPrefix="setup" showHttpMode={false} />
            <div className="form-actions">
                <Button type="ghost" text="Back" onClick={onBack} buttonType="button" disabled={submitting} />
                <div className="spacer" />
                <Button text={submitting ? "Saving" : "Continue"} buttonType="submit" disabled={submitting} />
            </div>
        </form>
    );
};
