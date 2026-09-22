import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Plus, Trash2 } from "lucide-react";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import { useToast } from "@/common/contexts/toast.js";
import { formatRelative } from "@/common/utils/formatUtils.js";
import { addPasskey, listPasskeys, passkeysSupported, removePasskey } from "@/common/utils/webauthn.js";

export const Passkeys = () => {
    const { sendToast } = useToast();
    const [passkeys, setPasskeys] = useState(null);
    const [name, setName] = useState("");
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState(null);

    const load = useCallback(async () => {
        try {
            setPasskeys(await listPasskeys());
        } catch (error) {
            if (error.code !== 401) sendToast("Error", error.message);
        }
    }, [sendToast]);

    useEffect(() => { load(); }, [load]);

    const add = async event => {
        event.preventDefault();
        setAdding(true);
        try {
            const result = await addPasskey(name);
            sendToast("Success", result.message);
            setName("");
            await load();
        } catch (error) {
            if (error.name !== "NotAllowedError") sendToast("Error", error.message);
        } finally {
            setAdding(false);
        }
    };

    const drop = async () => {
        try {
            sendToast("Success", (await removePasskey(removing.id)).message);
            await load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    if (!passkeysSupported()) {
        return <p className="passkeys-unsupported">This browser cannot use passkeys.</p>;
    }

    return (
        <div className="passkeys">
            <ActionConfirmDialog open={!!removing} setOpen={open => !open && setRemoving(null)} onConfirm={drop}
                                 title={`Remove ${removing?.name}?`}
                                 text="That passkey can no longer sign in to this account."
                                 confirmText="Remove" />

            {passkeys?.length > 0 && (
                <ul className="passkey-list">
                    {passkeys.map(passkey => (
                        <li key={passkey.id}>
                            <Fingerprint size={16} />
                            <div>
                                <span className="passkey-name">{passkey.name}</span>
                                <span className="passkey-meta">
                                    added {formatRelative(passkey.createdAt)}
                                    {passkey.lastUsedAt ? ` · last used ${formatRelative(passkey.lastUsedAt)}` : " · never used"}
                                </span>
                            </div>
                            <button type="button" onClick={() => setRemoving(passkey)} aria-label={`Remove ${passkey.name}`}>
                                <Trash2 />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <form className="passkey-add" onSubmit={add}>
                <Input id="passkey-name" label="Name" placeholder="This laptop" value={name} setValue={setName} />
                <Button icon={Plus} text={adding ? "Waiting" : "Add passkey"} buttonType="submit" type="secondary"
                        disabled={adding} />
            </form>
        </div>
    );
};
