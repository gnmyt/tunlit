import { useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import { decode } from "./body.js";

const languageFor = type => {
    if (/json/i.test(type)) return "json";
    if (/html|xml|svg/i.test(type)) return "markup";
    if (/css/i.test(type)) return "css";
    if (/javascript|ecmascript/i.test(type)) return "javascript";
    return null;
};

const prettify = (text, language) => {
    if (language !== "json") return text;
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
};

export const BodyView = ({ part, headers }) => {
    const type = headers.find(([name]) => name.toLowerCase() === "content-type")?.[1] || "";
    const text = part.body ? decode(part.body) : null;

    const html = useMemo(() => {
        if (text === null) return null;
        const language = languageFor(type);
        const source = prettify(text, language);
        if (!language || !Prism.languages[language]) return null;
        return Prism.highlight(source, Prism.languages[language], language);
    }, [text, type]);

    if (!part.bytes) return <p className="request-body-empty">No body</p>;
    if (!part.body) return <p className="request-body-empty">Body was not stored</p>;
    if (text === null) return <p className="request-body-empty">Binary, {part.bytes} bytes</p>;

    return (
        <>
            {html
                ? <pre className="request-body" dangerouslySetInnerHTML={{ __html: html }} />
                : <pre className="request-body">{text}</pre>}
            {part.truncated && <p className="request-body-note">Showing the first 64 kB of {part.bytes} bytes.</p>}
        </>
    );
};
