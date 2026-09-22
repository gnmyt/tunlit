const API_BASE = "/@tunlit/api/";

export const request = async (url, method, body, headers) => {
    url = url.startsWith("/") ? url.substring(1) : url;

    const response = await fetch(`${API_BASE}${url}`, {
        method: method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
    });

    const rawData = await response.text();
    const data = rawData ? JSON.parse(rawData) : {};

    if (!response.ok) throw Object.assign(new Error(data.message || data.error || `Request failed (${response.status})`), { code: response.status, ...data });

    return data;
};

export const getRequest = url => request(url, "GET");
export const postRequest = (url, body) => request(url, "POST", body);
export const putRequest = (url, body) => request(url, "PUT", body);
export const deleteRequest = url => request(url, "DELETE");
