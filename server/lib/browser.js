const { QUERY_PARAM } = require("./proxy");

const UI_PREFIX = "/@tunlit";
const SW_PATH = `${UI_PREFIX}/sw.js`;
const STORAGE_KEY = "tunlit-tunnel";

const serviceWorker = () => `const PARAM = ${JSON.stringify(QUERY_PARAM)};
const UI_PREFIX = ${JSON.stringify(UI_PREFIX)};

const bindings = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("message", event => {
    const data = event.data || {};
    if (data.type !== "tunlit-bind" || !data.tunnel || !event.source) return;
    bindings.set(event.source.id, data.tunnel);
    event.source.postMessage({ type: "tunlit-bound", tunnel: data.tunnel });
});

const ATTACH_PATH = new RegExp("^/@[a-z0-9-]{3,32}(/|$)");
const isOwnPath = url => url.pathname === UI_PREFIX || url.pathname.startsWith(UI_PREFIX + "/")
    || ATTACH_PATH.test(url.pathname);

const forward = async (request, tunnel, navigation) => {
    const url = new URL(request.url);
    url.searchParams.set(PARAM, tunnel);
    const init = {
        method: request.method,
        headers: request.headers,
        credentials: request.credentials,
        redirect: navigation ? "manual" : "follow",
    };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.blob();
    return fetch(new Request(url.toString(), init));
};

self.addEventListener("fetch", event => {
    const request = event.request;
    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }
    if (url.origin !== self.location.origin) return;
    if (isOwnPath(url) || url.searchParams.has(PARAM)) return;

    const navigation = request.mode === "navigate";
    const tunnel = bindings.get(event.clientId);

    if (tunnel) {
        if (navigation && event.resultingClientId) bindings.set(event.resultingClientId, tunnel);
        event.respondWith(forward(request, tunnel, navigation));
        return;
    }

    if (navigation) {
        const target = new URL(UI_PREFIX + "/reattach", self.location.origin);
        target.searchParams.set("to", request.url);
        event.respondWith(Response.redirect(target.toString(), 302));
    }
});
`;

const injectedScript = id => `<script>(function(){
var TUNNEL=${JSON.stringify(id)},PARAM=${JSON.stringify(QUERY_PARAM)},SW=${JSON.stringify(SW_PATH)};
try{sessionStorage.setItem(${JSON.stringify(STORAGE_KEY)},TUNNEL);}catch(e){}
try{if(navigator.serviceWorker){
var register=navigator.serviceWorker.register.bind(navigator.serviceWorker);
Object.defineProperty(navigator.serviceWorker,"register",{configurable:false,writable:false,value:function(){
return Promise.reject(new DOMException("Service workers are managed by tunlit in path mode","SecurityError"));}});
navigator.serviceWorker.getRegistrations().then(function(list){var mine=false;
list.forEach(function(r){var s=((r.active||r.waiting||r.installing)||{}).scriptURL||"";
if(s.indexOf(SW)!==-1){mine=true;}else{r.unregister();}});
if(!mine){register(SW,{scope:"/"});}});
navigator.serviceWorker.ready.then(function(r){var w=navigator.serviceWorker.controller||r.active;
if(w)w.postMessage({type:"tunlit-bind",tunnel:TUNNEL});});
}}catch(e){}
try{var Original=window.WebSocket;if(Original){var fix=function(value){var url;
try{url=new URL(String(value),location.href);}catch(e){return value;}
if(location.protocol==="https:"&&url.protocol==="ws:")url.protocol="wss:";
if(url.host===location.host)url.searchParams.set(PARAM,TUNNEL);return url.toString();};
window.WebSocket=new Proxy(Original,{construct:function(target,args){args[0]=fix(args[0]);return new target(args[0],args[1]);}});}}catch(e){}
})();</script>`;

const SERVICE_WORKER_SOURCE = serviceWorker();

try {
    new Function(SERVICE_WORKER_SOURCE);
} catch (err) {
    throw new Error(`The generated service worker does not parse: ${err.message}`);
}

module.exports = { SERVICE_WORKER_SOURCE, SW_PATH, injectedScript };
