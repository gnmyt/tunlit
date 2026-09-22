import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import { useToast } from "@/common/contexts/toast.js";

export const AccountStep = ({ account, setAccount, onBack, onNext }) => {
    const { sendToast } = useToast();
    const update = (key, value) => setAccount({ ...account, [key]: value });

    const submit = event => {
        event.preventDefault();
        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(account.username)) return sendToast("Error", "Username must be 3-32 characters");
        if (account.password.length < 8) return sendToast("Error", "Password must be at least 8 characters");
        if (account.password !== account.confirm) return sendToast("Error", "Passwords do not match");
        onNext();
    };

    return (
        <form onSubmit={submit}>
            <div className="form-head">
                <h1>Admin account.</h1>
                <p>Signs you in to this dashboard.</p>
            </div>
            <div className="form-body">
                <Input id="setup-username" label="Username" value={account.username} setValue={value => update("username", value)}
                       autoComplete="username" autoFocus required />
                <Input id="setup-password" type="password" label="Password" value={account.password}
                       setValue={value => update("password", value)} autoComplete="new-password" required />
                <Input id="setup-confirm" type="password" label="Confirm password" value={account.confirm}
                       setValue={value => update("confirm", value)} autoComplete="new-password" required />
            </div>
            <div className="form-actions">
                <Button type="ghost" text="Back" onClick={onBack} buttonType="button" />
                <div className="spacer" />
                <Button text="Continue" buttonType="submit" />
            </div>
        </form>
    );
};
