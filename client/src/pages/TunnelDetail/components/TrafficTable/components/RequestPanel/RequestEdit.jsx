import { useState } from "react";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import { Send } from "lucide-react";
import { decode } from "./body.js";

const parseHeaders = text => text.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const index = line.indexOf(":");
    return index === -1 ? [line, ""] : [line.slice(0, index).trim(), line.slice(index + 1).trim()];
});

export const RequestEdit = ({ entry, detail, onSend, onCancel, busy }) => {
    const stored = detail.request.body ? decode(detail.request.body) : "";
    const [method, setMethod] = useState(entry.method);
    const [path, setPath] = useState(entry.path);
    const [headers, setHeaders] = useState(detail.request.headers.filter(([, value]) => value !== "[hidden]").map(pair => pair.join(": ")).join("\n"));
    const [body, setBody] = useState(stored ?? "");
    const binary = stored === null;

    const submit = event => {
        event.preventDefault();
        onSend({ method, path, headers: parseHeaders(headers), ...(binary ? {} : { body }) });
    };

    return (
        <form className="request-edit" onSubmit={submit}>
            <div className="request-edit-line">
                <Input id="replay-method" value={method} setValue={value => setMethod(value.toUpperCase())} required />
                <Input id="replay-path" value={path} setValue={setPath} required />
            </div>
            <label htmlFor="replay-headers">Headers</label>
            <textarea id="replay-headers" value={headers} onChange={event => setHeaders(event.target.value)} rows={5} spellCheck={false} />
            <label htmlFor="replay-body">Body</label>
            {binary
                ? <p className="request-body-note">Binary body, sent as stored.</p>
                : <textarea id="replay-body" value={body} onChange={event => setBody(event.target.value)} rows={8} spellCheck={false} />}
            <div className="request-edit-actions">
                <Button type="ghost" text="Cancel" buttonType="button" onClick={onCancel} />
                <Button icon={Send} text={busy ? "Sending..." : "Send"} buttonType="submit" disabled={busy} />
            </div>
        </form>
    );
};
