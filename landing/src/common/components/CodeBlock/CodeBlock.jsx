import "./styles.sass";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export const CodeBlock = ({ title, code }) => {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="code-block">
            <div className="code-block-head">
                <span>{title}</span>
                <button type="button" onClick={copy} className={copied ? "copied" : ""} aria-label="Copy">
                    {copied ? <Check /> : <Copy />}
                </button>
            </div>
            <pre><code>{code}</code></pre>
        </div>
    );
};
