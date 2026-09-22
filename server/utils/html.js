const sendJson = (res, status, data, extraHeaders = {}) => {
    const body = JSON.stringify(data);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", ...extraHeaders });
    res.end(body);
};

module.exports = { sendJson };
