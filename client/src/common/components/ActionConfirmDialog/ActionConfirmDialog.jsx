import "./styles.sass";
import { DialogProvider } from "@/common/components/Dialog";
import Button from "@/common/components/Button";

export const ActionConfirmDialog = ({ open, setOpen, onConfirm, onCancel, title, text, confirmText }) => {
    const cancel = () => {
        setOpen(false);
        if (onCancel) onCancel();
    };

    const confirm = () => {
        setOpen(false);
        if (onConfirm) onConfirm();
    };

    return (
        <DialogProvider open={open} onClose={cancel}>
            <div className="confirm-dialog">
                <h2>{title || "Are you sure?"}</h2>
                {text && <p>{text}</p>}
                <div className="confirm-actions">
                    <Button type="secondary" text="Cancel" onClick={cancel} />
                    <Button text={confirmText || "Confirm"} onClick={confirm} />
                </div>
            </div>
        </DialogProvider>
    );
};
