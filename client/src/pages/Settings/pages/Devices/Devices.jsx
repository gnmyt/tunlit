import "./styles.sass";
import { useCallback, useEffect, useState } from "react";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import Loading from "@/common/components/Loading";
import { deleteRequest, getRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { formatRelative } from "@/common/utils/formatUtils.js";
import { Laptop, X } from "lucide-react";

export const Devices = () => {
    const { sendToast } = useToast();
    const [devices, setDevices] = useState(null);
    const [revoking, setRevoking] = useState(null);

    const load = useCallback(async () => {
        try {
            setDevices((await getRequest("devices")).devices);
        } catch (error) {
            if (error.code !== 401) sendToast("Error", "Could not load devices");
        }
    }, [sendToast]);

    useEffect(() => { load(); }, [load]);

    const revoke = async () => {
        try {
            const result = await deleteRequest(`devices/${revoking.id}`);
            sendToast("Success", result.message);
            load();
        } catch (error) {
            sendToast("Error", error.message);
        }
    };

    return (
        <section className="settings-panel">
            <ActionConfirmDialog open={!!revoking} setOpen={open => !open && setRevoking(null)} onConfirm={revoke}
                                 title={`Revoke ${revoking?.name}?`}
                                 text="That device can no longer create tunnels. Its running tunnels stay up until its CLI reconnects."
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
                            <div className="device-main">
                                <span className="device-name">{device.name}</span>
                                <span className="device-meta">
                                    {device.ip || "unknown"} · added {formatRelative(device.createdAt)}
                                    {device.lastUsedAt ? ` · last used ${formatRelative(device.lastUsedAt)}` : " · never used"}
                                </span>
                            </div>
                            <button type="button" onClick={() => setRevoking(device)} title="Revoke"
                                    aria-label={`Revoke ${device.name}`}>
                                <X />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};
