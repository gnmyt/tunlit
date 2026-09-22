import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import Button from "@/common/components/Button";
import Loading from "@/common/components/Loading";
import { ForwardingChoice, ForwardingExplainer } from "@/common/components/ForwardingChoice";
import { getRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";

export const Forwarding = () => {
    const { sendToast } = useToast();
    const [settings, setSettings] = useState(null);
    const [mode, setMode] = useState(null);
    const [preview, setPreview] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await getRequest("settings");
            setSettings(data.settings);
            setMode(data.settings.httpMode);
        } catch (error) {
            if (error.code !== 401) sendToast("Error", "Could not load settings");
        }
    }, [sendToast]);

    useEffect(() => { load(); }, [load]);

    if (!settings) return <Loading />;

    const shown = preview || mode;
    const dirty = mode !== settings.httpMode;

    const save = async () => {
        setSaving(true);
        try {
            const response = await putRequest("settings", { ...settings, httpMode: mode });
            setSettings(response.settings);
            setMode(response.settings.httpMode);
            sendToast("Success", "Forwarding mode saved");
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-panel">
            <div className="settings-head">
                <h2>Forwarding</h2>
                <p>How a web tunnel is reached.</p>
            </div>

            <ForwardingChoice value={mode} onChange={setMode} onPreview={setPreview} />

            <div className="forwarding-preview">
                <ForwardingExplainer mode={shown} domain={settings.baseDomain || "tunlit.example.com"} />
            </div>

            <div className="settings-actions">
                <div className="spacer" />
                <Button type="ghost" text="Reset" buttonType="button" disabled={!dirty || saving}
                        onClick={() => setMode(settings.httpMode)} />
                <Button text={saving ? "Saving" : "Save"} buttonType="button" onClick={save} disabled={!dirty || saving} />
            </div>
        </div>
    );
};
