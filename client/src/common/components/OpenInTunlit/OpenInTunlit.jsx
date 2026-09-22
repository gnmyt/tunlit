import "./styles.sass";
import { Terminal } from "lucide-react";
import Button from "@/common/components/Button";

export const OpenInTunlit = ({ code, server = window.location.origin }) => {
    const open = () => {
        window.location.href = `tunlit://connect/${encodeURIComponent(code)}?server=${encodeURIComponent(server)}`;
    };

    return (
        <div className="open-in-tunlit">
            <Button icon={Terminal} text="Open in tunlit" type="secondary" onClick={open} />
        </div>
    );
};
