import "./styles.sass";
import { useState } from "react";
import { DialogProvider } from "@/common/components/Dialog";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import Select from "@/common/components/Select";
import { useToast } from "@/common/contexts/toast.js";

const ROLES = [{ value: "user", label: "User" }, { value: "admin", label: "Admin" }];

export const NewAccountDialog = ({ open, setOpen, onCreate }) => {
    const { sendToast } = useToast();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("user");
    const [busy, setBusy] = useState(false);

    const close = () => {
        setOpen(false);
        setUsername("");
        setPassword("");
        setRole("user");
    };

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        try {
            await onCreate({ username, password, role });
            close();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogProvider open={open} onClose={close}>
            <form className="new-account" onSubmit={submit}>
                <div className="new-account-head">
                    <h2>New account</h2>
                    <p>They sign in with these details and can change the password themselves.</p>
                </div>

                <Input id="new-account-username" label="Username" value={username} setValue={setUsername}
                       autoComplete="off" autoFocus required />
                <Input id="new-account-password" label="Password" type="password" value={password} setValue={setPassword}
                       autoComplete="new-password" required />
                <Select id="new-account-role" label="Role" options={ROLES} selected={role} setSelected={setRole} />

                <div className="new-account-actions">
                    <Button text="Cancel" type="secondary" onClick={close} buttonType="button" />
                    <Button text={busy ? "Creating..." : "Create"} buttonType="submit" disabled={busy} />
                </div>
            </form>
        </DialogProvider>
    );
};
