import "./styles.sass";
import { useState } from "react";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import Button from "@/common/components/Button";
import CopyField from "@/common/components/CopyField";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { formatRelative } from "@/common/utils/formatUtils.js";

const STATES = {
    none: { tone: "idle", text: "No certificate yet." },
    requesting: { tone: "busy", text: "Talking to Let's Encrypt…" },
    stale: { tone: "warn", text: "The certificate does not cover every hostname any more." },
    expired: { tone: "warn", text: "The certificate has expired." },
    error: { tone: "warn", text: "The last request did not work." },
    ready: { tone: "ok", text: "Certificate in place." },
};

export const CertificatePanel = ({ status, onChanged }) => {
    const { sendToast } = useToast();
    const [busy, setBusy] = useState(false);
    const state = STATES[status.state] || STATES.none;

    const act = async (path, success) => {
        setBusy(true);
        try {
            const result = await postRequest(path);
            sendToast("Success", success || result.message);
            await onChanged();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="certificate">
            <div className={`certificate-state ${state.tone}`}>
                {state.tone === "ok" ? <CircleCheck size={16} /> : state.tone === "busy"
                    ? <RefreshCw size={16} className="spin" /> : <CircleAlert size={16} />}
                <div>
                    <strong>{state.text}</strong>
                    {status.certificate && (
                        <span>{status.certificate.altNames.join(", ")} · renews {formatRelative(status.certificate.expiresAt)}</span>
                    )}
                    {status.error && <span className="certificate-error">{status.error}</span>}
                </div>
            </div>

            {status.pendingRecords.length > 0 && (
                <div className="certificate-records">
                    <p>Add {status.pendingRecords.length === 1 ? "this TXT record" : "these TXT records"} at your DNS
                        provider, then continue. Let&apos;s Encrypt checks it from the outside, so give it a moment to spread.</p>
                    {status.pendingRecords.map(record => (
                        <div className="certificate-record" key={record.value}>
                            <span>{record.record}</span>
                            <CopyField value={record.value} />
                        </div>
                    ))}
                    <Button text="I added the record" onClick={() => act("tls/continue", "Checking the record")} disabled={busy} />
                </div>
            )}

            {!status.busy && (
                <div className="certificate-actions">
                    <Button icon={RefreshCw} type="secondary" disabled={busy}
                            text={status.certificate ? "Renew now" : "Request certificate"}
                            onClick={() => act("tls/request")} />
                </div>
            )}
        </div>
    );
};
