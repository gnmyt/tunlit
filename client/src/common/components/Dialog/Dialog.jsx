import { useCallback, useEffect, useRef } from "react";
import { DialogContext } from "./context.js";
import { createPortal } from "react-dom";
import "./styles.sass";

export const DialogProvider = ({ open, children, onClose, disableClosing }) => {
    const ref = useRef(null);

    const close = useCallback(() => {
        if (disableClosing) return;
        if (onClose) onClose();
    }, [disableClosing, onClose]);

    useEffect(() => {
        if (!open) return;

        const handleClick = event => { if (!ref.current?.contains(event.target)) close(); };
        const handleKey = event => { if (event.key === "Escape") close(); };

        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open, close]);

    if (!open) return null;

    return (
        <DialogContext.Provider value={close}>
            {createPortal(
                <div className="dialog-backdrop">
                    <div className="dialog" ref={ref} role="dialog" aria-modal="true">{children}</div>
                </div>,
                document.body,
            )}
        </DialogContext.Provider>
    );
};
