import { useCallback, useEffect, useState } from "react";
import Button from "@/common/components/Button";
import Loading from "@/common/components/Loading";
import ServerSettingsForm, { normalizeSettings } from "@/common/components/ServerSettingsForm";
import { getRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";

export const Server = () => {
    const { sendToast } = useToast();
    const [saved, setSaved] = useState(null);
    const [values, setValues] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await getRequest("settings");
            setSaved(data.settings);
            setValues(data.settings);
        } catch (error) {
            if (error.code !== 401) sendToast("Error", "Could not load settings");
        }
    }, [sendToast]);

    useEffect(() => { load(); }, [load]);

    if (!values) return <Loading />;

    const dirty = JSON.stringify(normalizeSettings(values)) !== JSON.stringify(normalizeSettings(saved));

    const save = async event => {
        event.preventDefault();
        setSaving(true);
        try {
            const response = await putRequest("settings", normalizeSettings(values));
            setSaved(response.settings);
            setValues(response.settings);
            sendToast("Success", "Settings saved");
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="settings-panel" onSubmit={save}>
            <div className="settings-head">
                <h2>Server</h2>
            </div>
            <ServerSettingsForm values={values} setValues={setValues} showHttpMode={false} />
            <div className="settings-actions">
                <div className="spacer" />
                <Button type="ghost" text="Reset" buttonType="button" disabled={!dirty || saving}
                        onClick={() => setValues(saved)} />
                <Button text={saving ? "Saving" : "Save"} buttonType="submit" disabled={!dirty || saving} />
            </div>
        </form>
    );
};
