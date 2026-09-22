import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import Loading from "@/common/components/Loading";
import Select from "@/common/components/Select";
import Toggle from "@/common/components/Toggle";
import { TlsChoice, TlsExplainer } from "@/common/components/TlsChoice";
import { getRequest, postRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import CertificatePanel from "./components/CertificatePanel";

const POLL_INTERVAL = 3000;

export const Https = () => {
    const { sendToast } = useToast();
    const [data, setData] = useState(null);
    const [mode, setMode] = useState(null);
    const [preview, setPreview] = useState(null);
    const [acme, setAcme] = useState({ email: "", provider: "manual", credential: "" });
    const [trustProxy, setTrustProxy] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (quiet = false) => {
        try {
            const [tls, settings] = await Promise.all([getRequest("tls"), getRequest("settings")]);
            setData(tls);
            setTrustProxy(!!settings.settings.trustProxy);
            if (!quiet) {
                setMode(tls.mode);
                setAcme({ ...tls.acme, email: tls.acme.email || "", credential: "" });
            }
        } catch (error) {
            if (error.code !== 401) sendToast("Error", error.message);
        }
    }, [sendToast]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!data?.status?.busy) return;
        const timer = setInterval(() => load(true), POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [data?.status?.busy, load]);

    if (!data || mode === null) return <Loading />;

    const managed = mode === "acme";
    const provider = data.providers.find(entry => entry.id === acme.provider);
    const needsWildcard = data.wildcard;

    const save = async () => {
        setSaving(true);
        try {
            await putRequest("settings", { tlsMode: mode, trustProxy: managed ? false : trustProxy });
            if (managed) {
                const values = { email: acme.email, provider: acme.provider };
                if (acme.credential) values.credential = acme.credential;
                await putRequest("tls", values);
            }
            sendToast("Success", managed ? "Saved. Restart tunlit to listen on 443." : "Saved");
            await load();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setSaving(false);
        }
    };

    const verify = async () => {
        try {
            sendToast("Info", (await postRequest("tls/verify")).message);
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    return (
        <section className="settings-panel">
            <div className="settings-head">
                <h2>HTTPS</h2>
                <p>Who holds the certificate for {data.status.domains.join(" and ")}.</p>
            </div>

            <div className="tls-layout">
                <TlsChoice value={mode} onChange={setMode} onPreview={setPreview} />
                <TlsExplainer mode={preview || mode} />
            </div>

            {!managed && (
                <div className="settings-form tls-section">
                    <Toggle id="tls-trustProxy" label="Trust proxy headers" checked={trustProxy} onChange={setTrustProxy} />
                    <p className="tls-note">
                        Turn this on only when nothing but your proxy can reach the port. The IP allowlist and the login
                        rate limit both believe whatever address <code>X-Forwarded-For</code> carries.
                    </p>
                </div>
            )}

            {managed && (
                <div className="settings-form tls-section">
                    <Input id="tls-email" label="Contact email" placeholder="you@example.com" value={acme.email}
                           setValue={value => setAcme({ ...acme, email: value })} autoComplete="off" />
                    <Select id="tls-provider" label="Challenge" selected={acme.provider}
                            setSelected={value => setAcme({ ...acme, provider: value })}
                            options={data.providers
                                .filter(entry => !needsWildcard || !entry.httpOnly)
                                .map(entry => ({ value: entry.id, label: entry.httpOnly ? "HTTP, no DNS provider" : entry.title }))} />
                    {provider?.needsCredential && (
                        <>
                            <Input id="tls-credential" type="password" label={provider.credentialLabel}
                                   placeholder={data.acme.hasCredential ? "Saved, type to replace" : ""}
                                   value={acme.credential} setValue={value => setAcme({ ...acme, credential: value })}
                                   autoComplete="off" />
                            {data.acme.hasCredential && (
                                <div className="tls-inline-action">
                                    <Button text="Test token" type="secondary" onClick={verify} />
                                </div>
                            )}
                        </>
                    )}
                    {needsWildcard && (
                        <p className="tls-note">
                            <ShieldCheck size={13} />
                            Subdomain forwarding needs the wildcard <code>*.{data.status.domains[0]}</code>, which only a
                            DNS challenge can prove.
                        </p>
                    )}
                </div>
            )}

            <div className="settings-actions">
                <div className="spacer" />
                <Button text={saving ? "Saving" : "Save"} onClick={save} disabled={saving} />
            </div>

            {managed && <CertificatePanel status={data.status} onChanged={load} />}
        </section>
    );
};
