import { useEffect, useState } from "react";
import Button from "@/common/components/Button";
import { ForwardingChoice, ForwardingExplainer } from "@/common/components/ForwardingChoice";
import { usePublicAside } from "@/common/layouts/aside.js";

export const ForwardingStep = ({ settings, setSettings, onBack, onNext }) => {
    const selected = settings.httpMode || "subdomain";
    const domain = settings.baseDomain?.trim() || "tunlit.example.com";
    const [preview, setPreview] = useState(null);
    const shown = preview || selected;

    const setAside = usePublicAside();
    useEffect(() => {
        setAside(<ForwardingExplainer mode={shown} domain={domain} />);
        return () => setAside(null);
    }, [setAside, shown, domain]);

    return (
        <div>
            <div className="form-head">
                <h1>Forwarding.</h1>
                <p>How a web tunnel is reached. This can be changed later.</p>
            </div>

            <ForwardingChoice value={selected} onPreview={setPreview}
                              onChange={mode => setSettings({ ...settings, httpMode: mode })} />
            <div className="mode-explainer-inline"><ForwardingExplainer mode={shown} domain={domain} /></div>

            <div className="form-actions">
                <Button type="ghost" text="Back" onClick={onBack} buttonType="button" />
                <div className="spacer" />
                <Button text="Continue" buttonType="button" onClick={onNext} />
            </div>
        </div>
    );
};
