import "./styles.sass";
import { useState } from "react";
import Input from "@/common/components/Input";
import Button from "@/common/components/Button";
import { deleteRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { Plus, RefreshCw, X } from "lucide-react";

const STATE_LABELS = {
    pending: "Waiting for DNS",
    issuing: "Getting certificate",
    active: "Active",
    error: "Error",
};

export const DomainsSection = ({ name, domains = [], onChanged }) => {
    const { sendToast } = useToast();
    const { serverInfo } = useUser();
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(null);

    const run = async (key, action, message) => {
        setBusy(key);
        try {
            const result = await action();
            sendToast("Success", message || result.message);
            onChanged?.();
            return true;
        } catch (error) {
            sendToast("Error", error.message);
            return false;
        } finally {
            setBusy(null);
        }
    };

    const add = async () => {
        const hostname = draft.trim().toLowerCase();
        if (!hostname) return;
        if (await run("add", () => postRequest(`persistent/${name}/domains`, { hostname }))) setDraft("");
    };

    return (
        <section className="domains">
            <div className="section-head">
                <h2>Custom domains</h2>
            </div>

            <div className="domains-card">
                {domains.length > 0 && (
                    <ul className="domain-list">
                        {domains.map(domain => (
                            <li key={domain.hostname}>
                                <div className="domain-main">
                                    <a href={domain.state === "active" ? domain.url : undefined} target="_blank" rel="noreferrer">
                                        {domain.hostname}
                                    </a>
                                    <span className={`domain-state ${domain.state}`}>{STATE_LABELS[domain.state] || domain.state}</span>
                                    {domain.state !== "active" && domain.error && <span className="domain-error">{domain.error}</span>}
                                    {domain.certificate && <span className="domain-cert">
                                        certificate until {new Date(domain.certificate.expiresAt).toLocaleDateString()}
                                    </span>}
                                </div>
                                <button type="button" title="Check again" aria-label={`Check ${domain.hostname}`}
                                        className={busy === domain.hostname ? "spinning" : ""}
                                        disabled={!!busy}
                                        onClick={() => run(domain.hostname, () => postRequest(`persistent/${name}/domains/${domain.hostname}/check`))}>
                                    <RefreshCw />
                                </button>
                                <button type="button" title="Remove" aria-label={`Remove ${domain.hostname}`} disabled={!!busy}
                                        onClick={() => run(domain.hostname, () => deleteRequest(`persistent/${name}/domains/${domain.hostname}`))}>
                                    <X />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="domain-add">
                    <Input id="domain-hostname" placeholder="app.example.com" value={draft} setValue={setDraft}
                           autoComplete="off" inputMode="url"
                           onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
                    <Button type="ghost" icon={Plus} text="Add" buttonType="button" onClick={add}
                            disabled={!!busy || !draft.trim()} />
                </div>

                <p className="domains-hint">CNAME it to <code>{serverInfo?.baseDomain}</code>.</p>
            </div>
        </section>
    );
};
