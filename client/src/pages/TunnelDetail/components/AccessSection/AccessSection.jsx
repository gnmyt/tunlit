import "./styles.sass";
import { useEffect, useState } from "react";
import Input from "@/common/components/Input";
import Select from "@/common/components/Select";
import Button from "@/common/components/Button";
import Toggle from "@/common/components/Toggle";
import Flag from "@/common/components/Flag";
import { countryCodes, countryName } from "@/common/utils/country.js";
import { putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { Plus, X } from "lucide-react";

const AUTH_OPTIONS = [
    { label: "Open to everyone", value: "none" },
    { label: "Password", value: "password" },
    { label: "tunlit account", value: "tunlit" },
];

const CATEGORIES = [["tor", "Tor exit nodes"], ["vpn", "VPN services"], ["datacenter", "Datacenters"], ["blocklist", "Blocklisted addresses"]];

const SUGGESTIONS = 6;

const matches = (text, taken) => {
    const value = text.trim().toLowerCase();
    if (!value) return [];
    return countryCodes
        .filter(code => !taken.includes(code) && (code.toLowerCase().startsWith(value) || countryName(code).toLowerCase().includes(value)))
        .slice(0, SUGGESTIONS);
};

const RuleList = ({ id, items, onChange, busy, country, placeholder }) => {
    const [draft, setDraft] = useState("");
    const suggestions = country ? matches(draft, items) : [];

    const add = value => {
        const entry = country ? suggestions[0] : value.trim();
        if (!entry) return;
        setDraft("");
        if (!items.includes(entry)) onChange([...items, entry]);
    };

    const pick = code => {
        setDraft("");
        onChange([...items, code]);
    };

    return (
        <div className="rule-group">
            {items.length > 0 && (
                <ul className="rule-list">
                    {items.map(item => (
                        <li key={item}>
                            {country ? <><Flag code={item} /><span>{countryName(item)}</span></> : <code>{item}</code>}
                            <button type="button" onClick={() => onChange(items.filter(entry => entry !== item))} disabled={busy}
                                    aria-label={`Remove ${item}`} title="Remove"><X /></button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="rule-add">
                <div className="rule-input">
                    <Input id={id} placeholder={placeholder} value={draft} setValue={setDraft} autoComplete="off"
                           onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(draft); } }} />
                    {suggestions.length > 0 && (
                        <ul className="rule-suggestions">
                            {suggestions.map(code => (
                                <li key={code}>
                                    <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => pick(code)} disabled={busy}>
                                        <Flag code={code} /><span>{countryName(code)}</span><small>{code}</small>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <Button type="ghost" icon={Plus} text="Add" buttonType="button" onClick={() => add(draft)}
                        disabled={busy || (country ? suggestions.length === 0 : !draft.trim())} />
            </div>
        </div>
    );
};

export const AccessSection = ({ tunnel, onSaved, endpoint = `tunnels/${tunnel.id}/access` }) => {
    const { sendToast } = useToast();
    const { allow, block } = tunnel.access;
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

    const saveAuth = () => save(
        { auth, ...(password ? { password } : {}) },
        auth === "none" ? "Sign-in turned off" : "Sign-in updated",
    ).then(ok => ok && setPassword(""));

    const toggleCategory = (key, on) => save(
        { block: { categories: on ? [...block.categories, key] : block.categories.filter(entry => entry !== key) } },
        "Rules updated",
    );

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
                        <h3>Allow only</h3>
                        {allow.ips.length + allow.countries.length === 0 && <p>Anyone not blocked may connect.</p>}
                    </div>
                    <h4>Addresses</h4>
                    <RuleList id="allow-ip" items={allow.ips} busy={busy} placeholder="203.0.113.5 or 10.0.0.0/8"
                              onChange={ips => save({ allow: { ips } }, "Rules updated")} />
                    <h4>Countries</h4>
                    <RuleList id="allow-country" items={allow.countries} busy={busy} country placeholder="Country or code"
                              onChange={countries => save({ allow: { countries } }, "Rules updated")} />
                </div>

                <div className="access-card">
                    <div className="access-card-head">
                        <h3>Block</h3>
                    </div>
                    <h4>Addresses</h4>
                    <RuleList id="block-ip" items={block.ips} busy={busy} placeholder="203.0.113.5 or 10.0.0.0/8"
                              onChange={ips => save({ block: { ips } }, "Rules updated")} />
                    <h4>Countries</h4>
                    <RuleList id="block-country" items={block.countries} busy={busy} country placeholder="Country or code"
                              onChange={countries => save({ block: { countries } }, "Rules updated")} />
                    <h4>Categories</h4>
                    <div className="rule-toggles">
                        {CATEGORIES.map(([key, label]) => (
                            <Toggle key={key} id={`block-${key}`} label={label} checked={block.categories.includes(key)}
                                    disabled={busy} onChange={on => toggleCategory(key, on)} />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
