import { useCallback, useState } from "react";
import { ToastContext } from "./toast.js";
import "@/common/styles/toast.sass";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

const ICONS = {
    Success: CircleCheck,
    Error: CircleAlert,
    Info: Info,
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback(id => setToasts(prev => prev.filter(toast => toast.id !== id)), []);

    const sendToast = useCallback((type, message, duration = 4000) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => removeToast(id), duration);
        return id;
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ sendToast, removeToast }}>
            {children}
            <div className="toast-container">
                {toasts.map(toast => {
                    const Glyph = ICONS[toast.type] || ICONS.Info;
                    return (
                    <div className="toast" key={toast.id} data-type={toast.type}>
                        <Glyph />
                        <span>{toast.message}</span>
                        <button type="button" onClick={() => removeToast(toast.id)} aria-label="Dismiss">
                            <X />
                        </button>
                    </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};
