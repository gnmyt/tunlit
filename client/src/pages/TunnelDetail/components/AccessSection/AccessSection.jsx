import "./styles.sass";
import { useEffect, useState } from "react";
import Input from "@/common/components/Input";
import Select from "@/common/components/Select";
import Button from "@/common/components/Button";
import { putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { Plus, X } from "lucide-react";

const AUTH_OPTIONS = [
    { label: "Open to everyone", value: "none" },
    { label: "Password", value: "password" },
    { label: "tunlit account", value: "tunlit" },
];

export const AccessSection = ({ tunnel, onSaved, endpoint = `tunnels/${tunnel.id}/access` }) => {
    const { sendToast } = useToast();
    const rules = tunnel.access?.allowedIps || [];
    const [draft, setDraft] = useState("");
    const [auth, setAuth] = useState(tunnel.access?.auth || "none");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => setAuth(tunnel.access?.auth || "none"), [tunnel.id, tunnel.access?.auth]);

    const isTcp = tunnel.mode === "tcp";
    const authChanged = auth !== (tunnel.access?.auth || "none") || !!password;
    const needsPassword = auth === "password" && !tunnel.access?.hasPassword && !password;

    const save = async (body, message) => {
        setBusy(true);
        try {
            await putRequest(endpoint, body);
            sendToast("Success", message);
            onSaved?.();
            return true;
        } catch (error) {
            sendToast("Error", error.message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const addRule = async () => {
        const entry = draft.trim();
        if (!entry) return;
        if (rules.includes(entry)) return setDraft("");
        if (await save({ allowedIps: [...rules, entry] }, `${entry} allowed`)) setDraft("");
    };

    const removeRule = rule => save({ allowedIps: rules.filter(entry => entry !== rule) }, `${rule} removed`);

    const saveAuth = () => save(
        { auth, ...(password ? { password } : {}) },
        auth === "none" ? "Sign-in turned off" : "Sign-in updated",
    ).then(ok => ok && setPassword(""));

    return (
        <section className="access">
            <div className="section-head">
                <h2>Access</h2>
                <span className="section-hint">{isTcp ? "Who may use the share code" : "Who may reach this tunnel"}</span>
            </div>

            <div className="access-cards">
                {!isTcp && (
                    <div className="access-card">
                        <div className="access-card-head">
                            <h3>Sign-in</h3>
                        </div>
                        <div className="access-card-body">
                            <Select id="access-auth" options={AUTH_OPTIONS} selected={auth} setSelected={setAuth} />
                            {auth === "password" && (
                                <Input id="access-password" type="password"
                                       placeholder={tunnel.access?.hasPassword ? "Leave empty to keep the current password" : "Password for visitors"}
                                       value={password} setValue={setPassword} autoComplete="new-password" />
                            )}
                        </div>
                        {authChanged && <div className="access-card-foot">
                            <Button type="ghost" text="Cancel" buttonType="button"
                                    onClick={() => { setAuth(tunnel.access?.auth || "none"); setPassword(""); }} />
                            <Button text="Save" buttonType="button" onClick={saveAuth} disabled={busy || needsPassword} />
                        </div>}
                    </div>
                )}

                <div className="access-card">
                    <div className="access-card-head">
                        <h3>Allowed addresses</h3>
                        {rules.length === 0 && <p>Any address may connect.</p>}
                    </div>

                    {rules.length > 0 && (
                        <ul className="rule-list">
                            {rules.map(rule => (
                                <li key={rule}>
                                    <code>{rule}</code>
                                    <button type="button" onClick={() => removeRule(rule)} disabled={busy}
                                            aria-label={`Remove ${rule}`} title="Remove">
                                        <X />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="rule-add">
                        <Input id="access-ip" placeholder="203.0.113.5 or 10.0.0.0/8" value={draft} setValue={setDraft}
                               onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addRule(); } }} />
                        <Button type="ghost" icon={Plus} text="Add" buttonType="button"
                                onClick={addRule} disabled={busy || !draft.trim()} />
                    </div>
                </div>
            </div>
        </section>
    );
};
