export const statusClass = status => {
    if (status >= 500) return "error";
    if (status >= 400) return "warn";
    if (status >= 300) return "info";
    if (status >= 200) return "ok";
    return "";
};

export const formatTime = time => new Date(time).toLocaleTimeString([], { hour12: false })
    + "." + String(new Date(time).getMilliseconds()).padStart(3, "0");
