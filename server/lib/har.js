const packageJson = require("../../package.json");

const pairs = list => list.map(([name, value]) => ({ name, value }));

const header = (list, wanted) => list.find(([name]) => name.toLowerCase() === wanted)?.[1] ?? "";

const text = body => {
    if (!body) return undefined;
    const bytes = Buffer.from(body, "base64");
    const decoded = bytes.toString("utf8");
    return Buffer.from(decoded, "utf8").equals(bytes) ? { text: decoded } : { text: body, encoding: "base64" };
};

const entry = (row, scheme) => {
    const url = new URL(row.path, `${scheme}://${row.host}`);
    return {
        startedDateTime: new Date(row.time).toISOString(),
        time: row.duration,
        request: {
            method: row.kind === "ws" ? "GET" : row.method,
            url: url.toString(),
            httpVersion: "HTTP/1.1",
            cookies: [],
            headers: pairs(row.request.headers),
            queryString: pairs([...url.searchParams]),
            headersSize: -1,
            bodySize: row.request.bytes,
            ...(row.request.body && { postData: { mimeType: header(row.request.headers, "content-type"), ...text(row.request.body) } }),
        },
        response: {
            status: row.status ?? 0,
            statusText: "",
            httpVersion: "HTTP/1.1",
            cookies: [],
            headers: pairs(row.response.headers),
            content: { size: row.response.bytes, mimeType: header(row.response.headers, "content-type"), ...text(row.response.body) },
            redirectURL: header(row.response.headers, "location"),
            headersSize: -1,
            bodySize: row.response.bytes,
        },
        cache: {},
        timings: { send: 0, wait: row.duration, receive: 0 },
        ...(row.ip && { serverIPAddress: row.ip }),
    };
};

const toHar = (rows, scheme) => ({
    log: {
        version: "1.2",
        creator: { name: "tunlit", version: packageJson.version },
        entries: rows.map(row => entry(row, scheme)),
    },
});

module.exports = { toHar };
