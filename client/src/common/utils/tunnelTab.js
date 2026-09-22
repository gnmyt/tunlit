const STORAGE_KEY = "tunlit-tunnel";
const SW_PATH = "/@tunlit/sw.js";

export const readTab = () => {
    try {
        return sessionStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
};

export const rememberTab = tunnel => {
    try {
        sessionStorage.setItem(STORAGE_KEY, tunnel);
    } catch { /* private mode: the worker binding below still carries this tab */ }
};

export const bindTab = tunnel => new Promise((resolve, reject) => {
    if (!navigator.serviceWorker || !window.isSecureContext) return reject(new Error("service workers unavailable"));

    const onMessage = event => {
        if (event.data?.type !== "tunlit-bound") return;
        navigator.serviceWorker.removeEventListener("message", onMessage);
        resolve();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    navigator.serviceWorker.register(SW_PATH, { scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .then(registration => {
            const worker = navigator.serviceWorker.controller || registration.active;
            if (!worker) return resolve();
            worker.postMessage({ type: "tunlit-bind", tunnel });
        })
        .catch(reject);
});

export const resetWorkers = async () => {
    try {
        const registrations = await navigator.serviceWorker?.getRegistrations() || [];
        await Promise.all(registrations.map(registration => registration.unregister()));
    } catch { /* nothing registered, or the API is unavailable */ }
};
