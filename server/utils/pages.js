const { readIndex } = require("./static");
const { sendJson } = require("./html");

const isNavigation = req => {
    const dest = req.headers["sec-fetch-dest"];
    if (dest === "document") return true;
    if (dest && dest !== "empty") return false;
    return /\btext\/html\b/.test(req.headers.accept || "");
};

const sendAppState = (req, res, status, state, extraHeaders = {}) => {
    const html = readIndex();

    if (!isNavigation(req) || !html) return sendJson(res, status, { error: state.kind, ...state }, extraHeaders);

    const payload = JSON.stringify(state).replace(/</g, "\\u003c");
    const body = html.replace("</head>", `<script>window.__tunlit__=${payload}</script></head>`);
    res.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
        ...extraHeaders,
    });
    res.end(req.method === "HEAD" ? undefined : body);
};

module.exports = { sendAppState, isNavigation };
