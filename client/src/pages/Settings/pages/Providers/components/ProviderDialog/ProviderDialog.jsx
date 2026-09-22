import "./styles.sass";
import { useState } from "react";
import { DialogProvider } from "@/common/components/Dialog";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import Toggle from "@/common/components/Toggle";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";

const EMPTY = {
    name: "", issuer: "", clientId: "", clientSecret: "",
    scope: "openid profile email", usernameClaim: "preferred_username", createAccounts: true,
};

export const ProviderDialog = ({ open, setOpen, onSaved }) => {
    const { sendToast } = useToast();
    const [values, setValues] = useState(EMPTY);
    const [busy, setBusy] = useState(false);

    const update = (key, value) => setValues({ ...values, [key]: value });

    const close = () => {
        setOpen(false);
        setValues(EMPTY);
    };

    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        try {
            sendToast("Success", (await postRequest("oidc", values)).message);
            close();
            await onSaved();
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogProvider open={open} onClose={close}>
            <form className="provider-dialog" onSubmit={submit}>
                <div className="provider-dialog-head">
                    <h2>Add a provider</h2>
                    <p>Anything that speaks OpenID Connect: Authentik, Keycloak, Entra, Google.</p>
                </div>

                <Input id="provider-name" label="Name" placeholder="Authentik" value={values.name}
                       setValue={value => update("name", value)} autoFocus required />
                <Input id="provider-issuer" label="Issuer URL" placeholder="https://id.example.com/application/o/tunlit/"
                       value={values.issuer} setValue={value => update("issuer", value)} required />
                <Input id="provider-client" label="Client ID" value={values.clientId}
                       setValue={value => update("clientId", value)} autoComplete="off" required />
                <Input id="provider-secret" type="password" label="Client secret" value={values.clientSecret}
                       setValue={value => update("clientSecret", value)} autoComplete="new-password" />
                <Input id="provider-claim" label="Username claim" value={values.usernameClaim}
                       setValue={value => update("usernameClaim", value)} />
                <Toggle id="provider-create" label="Create an account on first sign-in" checked={values.createAccounts}
                        onChange={value => update("createAccounts", value)} />

                <div className="provider-dialog-actions">
                    <Button text="Cancel" type="secondary" onClick={close} buttonType="button" />
                    <Button text={busy ? "Adding" : "Add"} buttonType="submit" disabled={busy} />
                </div>
            </form>
        </DialogProvider>
    );
};
