import { useEffect, useState } from "react";
import Button from "@/common/components/Button";
import Toggle from "@/common/components/Toggle";
import { TlsChoice, TlsExplainer } from "@/common/components/TlsChoice";
import { usePublicAside } from "@/common/layouts/aside.js";

export const HttpsStep = ({ settings, setSettings, onBack, onNext }) => {
    const selected = settings.tlsMode || "proxy";
    const [preview, setPreview] = useState(null);
    const shown = preview || selected;
    const wildcard = (settings.httpMode || "subdomain") === "subdomain";
    const domain = settings.baseDomain?.trim() || "tunlit.example.com";

    const setAside = usePublicAside();
    useEffect(() => {
        setAside(<TlsExplainer mode={shown} />);
        return () => setAside(null);
    }, [setAside, shown]);

    return (
        <div>
            <div className="form-head">
                <h1>HTTPS.</h1>
                <p>Who holds the certificate. This can be changed later.</p>
            </div>

            <TlsChoice value={selected} onPreview={setPreview}
                       onChange={mode => setSettings({ ...settings, tlsMode: mode })} />
            <div className="mode-explainer-inline"><TlsExplainer mode={shown} /></div>

            {selected === "proxy" ? (
                <div className="setup-note">
                    <Toggle id="setup-trustProxy" label="Trust proxy headers" checked={!!settings.trustProxy}
                            onChange={value => setSettings({ ...settings, trustProxy: value })} />
                    <p>
                        Turn this on once only your proxy can reach the port. The reverse proxy guide in the
                        documentation has an nginx config you can paste.
                    </p>
                </div>
            ) : (
                <div className="setup-note">
                    <p>
                        tunlit will ask Let&apos;s Encrypt for a certificate
                        {wildcard ? <> covering <code>{domain}</code> and <code>*.{domain}</code></> : <> for <code>{domain}</code></>}.
                        {wildcard
                            ? " A wildcard needs a DNS challenge, so have an API token for your DNS provider ready."
                            : " Point the domain at this machine and it can use an HTTP challenge, no DNS token needed."}
                    </p>
                    <p>Finish the setup first, then request the certificate under Settings → HTTPS.</p>
                </div>
            )}

            <div className="form-actions">
                <Button type="ghost" text="Back" onClick={onBack} buttonType="button" />
                <div className="spacer" />
                <Button text="Continue" buttonType="button" onClick={onNext} />
            </div>
        </div>
    );
};
