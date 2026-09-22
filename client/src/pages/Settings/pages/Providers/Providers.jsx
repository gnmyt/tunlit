import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import Button from "@/common/components/Button";
import CopyField from "@/common/components/CopyField";
import Loading from "@/common/components/Loading";
import Toggle from "@/common/components/Toggle";
import { deleteRequest, getRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import ProviderDialog from "./components/ProviderDialog";

export const Providers = () => {
    const { sendToast } = useToast();
    const [data, setData] = useState(null);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState(null);

    const load = useCallback(async () => {
        try {
            setData(await getRequest("oidc"));
        } catch (error) {
            if (error.code !== 401) sendToast("Error", error.message);
        }
    }, [sendToast]);

    useEffect(() => { load(); }, [load]);

    const toggle = async (provider, enabled) => {
        try {
            await putRequest(`oidc/${provider.id}`, { enabled });
            await load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const drop = async () => {
        try {
            sendToast("Success", (await deleteRequest(`oidc/${removing.id}`)).message);
            await load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    if (!data) return <Loading />;

    return (
        <section className="settings-panel">
            <ProviderDialog open={adding} setOpen={setAdding} onSaved={load} />
            <ActionConfirmDialog open={!!removing} setOpen={open => !open && setRemoving(null)} onConfirm={drop}
                                 title={`Remove ${removing?.name}?`}
                                 text="Accounts it created stay, but nobody can sign in through it any more."
                                 confirmText="Remove" />

            <div className="settings-head">
                <h2>Login providers</h2>
                <p>Let people sign in with an OpenID Connect provider instead of a tunlit password.</p>
            </div>

            {data.providers.length === 0 && (
                <div className="providers-empty"><KeyRound size={20} /><p>No providers yet.</p></div>
            )}

            {data.providers.length > 0 && (
                <ul className="provider-list">
                    {data.providers.map(provider => (
                        <li key={provider.id}>
                            <div className="provider-main">
                                <span className="provider-name">{provider.name}</span>
                                <span className="provider-meta">
                                    {provider.issuer} · {provider.createAccounts ? "creates accounts" : "existing accounts only"}
                                </span>
                            </div>
                            <Toggle id={`provider-${provider.id}`} checked={provider.enabled}
                                    onChange={value => toggle(provider, value)} />
                            <button type="button" onClick={() => setRemoving(provider)} aria-label={`Remove ${provider.name}`}>
                                <Trash2 />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="provider-redirect">
                <span>Redirect URI to paste into the provider</span>
                <CopyField value={data.redirectUri} />
            </div>

            <div className="settings-actions">
                <Button text="Add provider" icon={Plus} onClick={() => setAdding(true)} />
            </div>
        </section>
    );
};
