import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import { Plus, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import Button from "@/common/components/Button";
import Loading from "@/common/components/Loading";
import Select from "@/common/components/Select";
import QuotaFields, { fromForm, toForm } from "@/common/components/QuotaFields";
import { deleteRequest, getRequest, postRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { formatBytes, formatRelative } from "@/common/utils/formatUtils.js";
import NewAccountDialog from "./components/NewAccountDialog";
import LimitsDialog from "./components/LimitsDialog";

const ROLES = [{ value: "admin", label: "Admin" }, { value: "user", label: "User" }];

export const Accounts = () => {
    const { sendToast } = useToast();
    const { user } = useUser();
    const [accounts, setAccounts] = useState(null);
    const [defaults, setDefaults] = useState(null);
    const [limits, setLimits] = useState(null);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [editing, setEditing] = useState(null);

    const load = useCallback(async () => {
        try {
            const data = await getRequest("accounts");
            setAccounts(data.accounts);
            setDefaults(data.defaults);
            setLimits(current => current || toForm(data.defaults));
        } catch (error) {
            if (error.code !== 401) sendToast("Error", "Could not load accounts");
        }
    }, [sendToast]);

    const saveDefaults = async event => {
        event.preventDefault();
        try {
            const result = await putRequest("quotas", fromForm(limits));
            sendToast("Success", result.message);
            setDefaults(result.defaults);
            setLimits(toForm(result.defaults));
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const saveLimits = async quotas => {
        const result = await putRequest(`accounts/${editing.id}`, { quotas });
        sendToast("Success", result.message);
        load();
    };

    useEffect(() => { load(); }, [load]);

    const create = async values => {
        const result = await postRequest("accounts", values);
        sendToast("Success", result.message);
        load();
    };

    const changeRole = async (account, role) => {
        try {
            const result = await putRequest(`accounts/${account.id}`, { role });
            sendToast("Success", result.message);
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    const remove = async () => {
        try {
            const result = await deleteRequest(`accounts/${deleting.id}`);
            sendToast("Success", result.message);
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    return (
        <>
        {limits && (
            <form className="settings-panel" onSubmit={saveDefaults}>
                <div className="settings-head">
                    <h2>Limits</h2>
                    <p>Per user, 0 for none. Admins are not limited.</p>
                </div>
                <QuotaFields idPrefix="defaults" values={limits} setValues={setLimits} />
                <div className="settings-actions">
                    <div className="spacer" />
                    <Button text="Save" buttonType="submit" disabled={JSON.stringify(limits) === JSON.stringify(toForm(defaults))} />
                </div>
            </form>
        )}
        <section className="settings-panel">
            <NewAccountDialog open={creating} setOpen={setCreating} onCreate={create} />
            {editing && <LimitsDialog account={editing} defaults={defaults} onClose={() => setEditing(null)} onSave={saveLimits} />}
            <ActionConfirmDialog open={!!deleting} setOpen={open => !open && setDeleting(null)} onConfirm={remove}
                                 title={`Delete ${deleting?.username}?`}
                                 text="Their devices and sessions go with them. Tunnels they have open close when the CLI reconnects."
                                 confirmText="Delete" />

            <div className="settings-head">
                <h2>Accounts</h2>
                <p>Everyone signs in with their own account and sees their own tunnels.</p>
            </div>

            {!accounts && <Loading />}
            {accounts && (
                <ul className="account-list">
                    {accounts.map(account => (
                        <li key={account.id}>
                            <div className="account-avatar"><UserRound size={16} /></div>
                            <div className="account-main">
                                <span className="account-name">
                                    {account.username}
                                    {account.id === user?.id && <span className="account-you">you</span>}
                                </span>
                                <span className="account-meta">
                                    {account.role === "admin" ? `added ${formatRelative(account.createdAt)}`
                                        : `${formatBytes(account.usage.traffic)} this month · ${account.usage.tunnels} ${account.usage.tunnels === 1 ? "tunnel" : "tunnels"}${account.quotas ? " · own limits" : ""}`}
                                </span>
                            </div>
                            <Select options={ROLES} selected={account.role} disabled={account.id === user?.id}
                                    setSelected={role => changeRole(account, role)} />
                            <button type="button" onClick={() => setEditing(account)} title="Limits" className="account-limits"
                                    disabled={account.role === "admin"} aria-label={`Limits for ${account.username}`}>
                                <SlidersHorizontal />
                            </button>
                            <button type="button" onClick={() => setDeleting(account)} title="Delete"
                                    disabled={account.id === user?.id} aria-label={`Delete ${account.username}`}>
                                <Trash2 />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="settings-actions">
                <Button text="Add account" icon={Plus} onClick={() => setCreating(true)} />
            </div>
        </section>
        </>
    );
};
