import "./styles.sass";
import { useState } from "react";
import { copyToClipboard } from "@/common/utils/clipboard.js";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

export const CopyField = ({ value, secret }) => {
    const [copied, setCopied] = useState(false);
    const [revealed, setRevealed] = useState(!secret);

    const copy = async () => {
        if (!await copyToClipboard(value)) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="copy-field">
            <code>{revealed ? value : "•".repeat(Math.min(value?.length || 0, 28))}</code>
            {secret && (
                <button type="button" onClick={() => setRevealed(!revealed)} aria-label={revealed ? "Hide" : "Reveal"}>
                    {revealed ? <EyeOff /> : <Eye />}
                </button>
            )}
            <button type="button" onClick={copy} aria-label="Copy" className={copied ? "copied" : ""}>
                {copied ? <Check /> : <Copy />}
            </button>
        </div>
    );
};
