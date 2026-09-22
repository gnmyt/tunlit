# 🚇 Introduction

tunlit is a self-hosted tunnel server with a matching CLI. You run the server on a machine with a public address,
and the CLI on any machine that has something worth sharing. All traffic goes through **one public port**, so there
is nothing else to open in your firewall. tunlit can hold its own certificate or sit behind a proxy you already
run, whichever you prefer.

![The tunnel list](/screenshots/tunnels.png)

## The three modes

HTTP tunnels are always created with `tunlit http <port>`. Whether they end up on a subdomain or under a path is a
server setting, so everyone using a server gets the same kind of URL.

### 🌐 Subdomain - `httpMode: subdomain`

The classic ngrok experience. Your local HTTP server gets its own hostname like `https://k3x9ab.tunlit.example.com`.
HTTP and WebSockets work, redirects that point at your local machine are rewritten to the public host.

### 🍪 Path / cookie - `httpMode: path`

For setups without a wildcard certificate, or when you want everything under one hostname. Visiting
`https://tunlit.example.com/@k3x9ab` binds **that browser tab** to the tunnel, so two tabs can hold different
tunnels at the same URL. Refreshes, link clicks and form posts all stay on the tab's own
tunnel. For anything that is not a browser, name the tunnel in the query string:
`curl https://tunlit.example.com/api?tunlit-tunnel=<id>`.

Two things to know before choosing it: every path-mode tunnel lives on the same origin, so cookies and storage are
shared between the apps you open this way, and it only works over HTTPS or on `localhost`. Apps that need to be
isolated from each other belong on subdomains.

### 🔌 Direct TCP + UDP - `tunlit tcp <port>`

No website at all. The owner gets a share code, the other side runs `tunlit connect <code>` and gets the port on
their own machine - both TCP **and** UDP on the same port number, automatically. Perfect for game servers, SSH or
databases.

![The page behind a share link](/screenshots/connect.png)

Read on: [Installation](/installation) · [Configuration](/configuration) · [Reverse proxy](/reverse-proxy) ·
[CLI](/cli) · [HTTPS](/https)
