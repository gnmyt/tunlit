import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import Loading from "@/common/components/Loading";
import Button from "@/common/components/Button";
import CopyField from "@/common/components/CopyField";
import Input from "@/common/components/Input";
import { deleteRequest, getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { formatRelative } from "@/common/utils/formatUtils.js";
import { KeyRound, Laptop, Link, X } from "lucide-react";

export const Devices = () => {
    const { sendToast } = useToast();
    const { serverInfo } = useUser();
    const [devices, setDevices] = useState(null);
    const [invites, setInvites] = useState(null);
    const [revoking, setRevoking] = useState(null);
    const [label, setLabel] = useState("");
    const [created, setCreated] = useState(null);
    const [keyName, setKeyName] = useState("");
    const [createdKey, setCreatedKey] = useState(null);

    const load = useCallback(async () => {
        try {
            const [own, links] = await Promise.all([getRequest("devices"), getRequest("invites")]);
            setDevices(own.devices);
            setInvites(links.invites);
        } catch (error) {
            if (error.code !== 401) sendToast("Error", "Could not load devices");
        }
    }, [sendToast]);

    useEffect(() => { load(); }, [load]);

    const revoke = async () => {
        try {
            const result = await deleteRequest(`${revoking.kind}/${revoking.id}`);
            sendToast("Success", result.message);
            if (revoking.kind === "invites" && created?.invite.id === revoking.id) setCreated(null);
            if (revoking.kind === "devices" && createdKey?.device.id === revoking.id) setCreatedKey(null);
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const createKey = async event => {
        event.preventDefault();
        try {
            setCreatedKey(await postRequest("devices", { name: keyName }));
            setKeyName("");
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const create = async event => {
        event.preventDefault();
        try {
            setCreated(await postRequest("invites", { label }));
            setLabel("");
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    return (
        <section className="settings-panel">
            <ActionConfirmDialog open={!!revoking} setOpen={open => !open && setRevoking(null)} onConfirm={revoke}
                                 title={`Revoke ${revoking?.name}?`}
                                 text="Its tunnels close now and it can no longer open new ones."
                                 confirmText="Revoke" />

            <div className="settings-head">
                <h2>Devices</h2>
            </div>

            {!devices && <Loading />}
            {devices?.length === 0 && (
                <div className="devices-empty"><Laptop size={20} /><p>No devices yet.</p></div>
            )}
            {devices?.length > 0 && (
                <ul className="device-list">
                    {devices.map(device => (
                        <li key={device.id}>
                            {device.kind === "key" && <KeyRound size={16} className="invite-icon" />}
                            <div className="device-main">
                                <span className="device-name">{device.name}</span>
                                <span className="device-meta">
                                    {device.ip || "unknown"} · added {formatRelative(device.createdAt)}
                                    {device.lastUsedAt ? ` · last used ${formatRelative(device.lastUsedAt)}` : " · never used"}
                                </span>
                            </div>
                            <button type="button" onClick={() => setRevoking({ kind: "devices", id: device.id, name: device.name })} title="Revoke"
                                    aria-label={`Revoke ${device.name}`}>
                                <X />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="settings-head invites-head">
                <h2>API keys</h2>
                <p>For servers, CI and scripts. No browser needed.</p>
            </div>
            <form className="invite-form" onSubmit={createKey}>
                <Input id="key-name" placeholder="Where will it run?" value={keyName} setValue={setKeyName} required />
                <Button text="Create key" buttonType="submit" />
            </form>
            {createdKey && (
                <div className="invite-created">
                    <span>Key for {createdKey.device.name}. It is shown only now.</span>
                    <CopyField value={`tunlit login --server ${serverInfo.publicUrl} --token ${createdKey.token}`} />
                </div>
            )}

            <div className="settings-head invites-head">
                <h2>Invite links</h2>
                <p>Let someone tunnel through this server without an account.</p>
            </div>
            <form className="invite-form" onSubmit={create}>
                <Input id="invite-label" placeholder="Who is this for?" value={label} setValue={setLabel} required />
                <Button text="Create link" buttonType="submit" />
            </form>
            {created && (
                <div className="invite-created">
                    <span>Link for {created.invite.label}. It is shown only now.</span>
                    <CopyField value={created.link} />
                </div>
            )}
            {invites?.length > 0 && (
                <ul className="device-list">
                    {invites.map(invite => (
                        <li key={invite.id}>
                            <Link size={16} className="invite-icon" />
                            <div className="device-main">
                                <span className="device-name">{invite.label}</span>
                                <span className="device-meta">
                                    {invite.owner ? `${invite.owner} · ` : ""}created {formatRelative(invite.createdAt)}
                                    {invite.lastUsedAt ? ` · used ${invite.uses}× · last ${formatRelative(invite.lastUsedAt)}` : " · never used"}
                                </span>
                            </div>
                            <button type="button" onClick={() => setRevoking({ kind: "invites", id: invite.id, name: invite.label })} title="Revoke"
                                    aria-label={`Revoke ${invite.label}`}>
                                <X />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};
