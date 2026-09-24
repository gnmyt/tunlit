import { useMemo } from "react";
import CodeEditor from "@/common/components/CodeEditor";
import { languageFor } from "@/common/components/CodeEditor/detect.js";
import { decode } from "./body.js";

const pretty = (text, language) => {
    if (language !== "json") return text;
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
};

export const BodyView = ({ part, headers }) => {
    const type = headers.find(([name]) => name.toLowerCase() === "content-type")?.[1] || "";
    const language = languageFor(type);
    const text = useMemo(() => (part.body ? decode(part.body) : null), [part.body]);
    const source = useMemo(() => (text === null ? null : pretty(text, language)), [text, language]);

    if (!part.bytes) return <p className="request-body-empty">No body</p>;
    if (!part.body) return <p className="request-body-empty">Body was not stored</p>;
    if (text === null) return <p className="request-body-empty">Binary, {part.bytes} bytes</p>;

    return (
        <>
            <CodeEditor value={source} language={language} readOnly maxHeight="32rem" />
            {part.truncated && <p className="request-body-note">Showing the first 64 kB of {part.bytes} bytes.</p>}
        </>
    );
};
