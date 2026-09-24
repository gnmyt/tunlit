import { useState } from "react";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import CodeEditor from "@/common/components/CodeEditor";
import { languageFor } from "@/common/components/CodeEditor/detect.js";
import { Play, Send } from "lucide-react";
import { decode } from "./body.js";

const parseHeaders = text => text.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const index = line.indexOf(":");
    return index === -1 ? [line, ""] : [line.slice(0, index).trim(), line.slice(index + 1).trim()];
});

const contentType = headers => parseHeaders(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] || "";

export const RequestEdit = ({ entry, detail, onSend, onCancel, busy, held, part }) => {
    const source = detail[part];
    const stored = source.body ? decode(source.body) : "";
    const [method, setMethod] = useState(entry.method);
    const [path, setPath] = useState(entry.path);
    const [status, setStatus] = useState(String(detail.status));
    const [headers, setHeaders] = useState(source.headers.map(pair => pair.join(": ")).join("\n"));
    const [body, setBody] = useState(stored ?? "");
    const binary = stored === null;

    const submit = event => {
        event.preventDefault();
        const line = part === "response" ? { status: Number(status) } : { method, path };
        onSend({ ...line, headers: parseHeaders(headers), ...(binary ? {} : { body }) });
    };

    return (
        <form className="request-edit" onSubmit={submit}>
            {part === "response"
                ? <div className="request-edit-line">
                    <Input id="replay-status" value={status} setValue={setStatus} inputMode="numeric" required />
                </div>
                : <div className="request-edit-line">
                    <Input id="replay-method" value={method} setValue={value => setMethod(value.toUpperCase())} required />
                    <Input id="replay-path" value={path} setValue={setPath} required />
                </div>}
            <CodeEditor label="Headers" language="headers" value={headers} onChange={setHeaders} maxHeight="14rem" />
            {binary
                ? <p className="request-body-note">Binary body, sent as is.</p>
                : <CodeEditor label="Body" language={languageFor(contentType(headers))} value={body} onChange={setBody} />}
            <div className="request-edit-actions">
                <Button type="ghost" text="Cancel" buttonType="button" onClick={onCancel} />
                <Button icon={held ? Play : Send} text={busy ? "Sending..." : held ? "Continue" : "Send"} buttonType="submit" disabled={busy} />
            </div>
        </form>
    );
};
