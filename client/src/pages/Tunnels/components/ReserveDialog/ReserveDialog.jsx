import "./styles.sass";
import { useState } from "react";
import { DialogProvider } from "@/common/components/Dialog";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";

export const ReserveDialog = ({ open, setOpen, onReserved }) => {
    const { sendToast } = useToast();
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);

    const close = () => {
        setOpen(false);
        setName("");
    };

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await postRequest("persistent", { name: name.trim().toLowerCase() });
            sendToast("Success", result.message);
            close();
            onReserved?.(result.tunnel);
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogProvider open={open} onClose={close}>
            <form className="reserve" onSubmit={submit}>
                <div className="reserve-head">
                    <h2>Reserve a name.</h2>
                    <p>Reserved for your account, with its own access rules and domains.</p>
                </div>

                <Input id="reserve-name" label="Name" value={name} setValue={setName} placeholder="myapp"
                       autoComplete="off" autoFocus required />

                <div className="reserve-actions">
                    <Button text="Cancel" type="secondary" onClick={close} buttonType="button" />
                    <Button text={busy ? "Reserving..." : "Reserve"} buttonType="submit" disabled={busy || !name.trim()} />
                </div>
            </form>
        </DialogProvider>
    );
};
