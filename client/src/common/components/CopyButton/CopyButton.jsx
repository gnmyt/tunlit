import "./styles.sass";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/common/utils/clipboard.js";

export const CopyButton = ({ value, label = "Copy" }) => {
    const [copied, setCopied] = useState(false);

    const copy = async event => {
        event.stopPropagation();
        if (!await copyToClipboard(value)) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <button type="button" className={`copy-button${copied ? " copied" : ""}`} onClick={copy} aria-label={label} title={label}>
            {copied ? <Check /> : <Copy />}
        </button>
    );
};
