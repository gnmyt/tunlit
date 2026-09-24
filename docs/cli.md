# ⌨️ CLI

The tunlit CLI (`tunlit`) is a single static binary. It opens one WebSocket to your server and pipes bytes between
your local port and the visitors - nothing else runs on your machine.

## Installation

`apt`, `dnf`, a Windows installer or a single binary, all in [Installation](/installation).

## Getting started

```sh
tunlit login
```

You are asked for the server URL, and the CLI then prints a short code and opens the approval page in your
browser. Sign in there with your tunlit account and approve the device. The CLI is handed a token **of its own**,
saved to `~/.config/tunlit/config.json` (`%APPDATA%\tunlit\config.json` on Windows,
`~/Library/Application Support/tunlit/config.json` on macOS).

There is no shared secret: every machine holds its own token, and each one can be revoked separately under
Settings › Devices in the web UI.

For an unattended machine, approve it once somewhere with a browser and copy the token over:

```sh
tunlit config set server-url https://tunlit.example.com
tunlit config set device-token <token>
```

`TUNLIT_SERVER` still overrides the saved server URL.

## Commands

Every mode accepts the local target as a plain port (`3000` means `127.0.0.1:3000`) or `host:port`
(`192.168.1.5:8080`). `tunlit http` also takes a URL: `https://localhost:8443` makes the CLI speak TLS to the target,
and a bare `host:443` is treated the same way. The certificate is not checked, since it is usually self-signed on a
dev machine, so the tunnel works with whatever the app presents. Visitors still get the server's own certificate.

`tunlit http` also accepts a **directory**. tunlit then serves it with a built-in static file server, so you can skip
`python3 -m http.server`:

```sh
tunlit http .          # share the current folder
tunlit http ./dist     # share a build output
```

`index.html` is served for directories that have one, everything else gets a directory listing. The server only ever
runs on `127.0.0.1` on a random port and stops together with the tunnel.

### HTTP tunnel

```sh
tunlit http 3000
tunlit http 192.168.1.5:8080 --name myapp
tunlit http https://localhost:8443
tunlit http ./public --name site
```

The server decides how the tunnel is exposed (`httpMode` in its configuration): on its own subdomain
`https://myapp.tunlit.example.com`, or under `https://tunlit.example.com/@myapp` in path mode. The CLI prints whatever
it got. See [Introduction](/introduction) for what each mode does to the URL.

```
✓ Tunnel myapp is online
  https://myapp.tunlit.example.com  →  192.168.1.5:8080

  [QR code]
✓ Copied to clipboard
Press Ctrl+C to stop.
```

### Routing by path

One tunnel can send different paths to different places:

```sh
tunlit http 3000 --route /api=4000 --route /docs=./site
```

The positional target takes everything that matches no route; the longest matching prefix wins. Ports and
`host:port` targets receive the full path, directories are mounted at their prefix (`/docs/guide.html` serves
`./site/guide.html`). In `tunnels.yml`:

```yaml
tunnels:
  shop:
    http: 3000
    routes:
      /api: 4000
      /docs: ./site
```

### Simulating a bad connection

```sh
tunlit http 3000 --latency 200ms --jitter 50ms --bandwidth 512kbps --loss 2%
tunlit tcp 27015 --latency 80ms --loss 5%
```

| Flag                   | Description                                                                  |
|------------------------|------------------------------------------------------------------------------|
| `--latency <duration>` | Added in each direction, `200ms` or `1s`.                                    |
| `--jitter <duration>`  | Random extra delay, 0 to this value.                                         |
| `--bandwidth <rate>`   | Cap per direction, `512kbps`, `2mbps` or `100kB/s`.                          |
| `--loss <percent>`     | UDP datagrams are dropped; TCP data stalls instead, like a retransmit would. |

Applies between the CLI and your app, so every mode is covered. In `tunnels.yml` for [`tunlit start`](/service):

```yaml
tunnels:
  shop:
    http: 3000
    shape:
      latency: 200ms
      jitter: 50ms
      bandwidth: 512kbps
      loss: 2
```

### Protecting a tunnel

```sh
tunlit http 3000 --password hunter2          # ask visitors for a password
tunlit http 3000 --require-login             # ask visitors for a tunlit account
tunlit serve --allow 10.0.0.0/8              # only this range may connect
tunlit http 3000 --allow-country de,at,ch    # only these countries
tunlit http 3000 --block tor --block vpn     # no Tor exit nodes or VPNs
tunlit tcp 25565 --block-country ru          # rules work for tcp too
```

| Flag                      | Description                                                        |
|---------------------------|--------------------------------------------------------------------|
| `--allow <cidr>`          | Only these addresses or ranges.                                    |
| `--allow-country <code>`  | Only these countries, two-letter codes.                            |
| `--block-ip <cidr>`       | Never these addresses or ranges.                                   |
| `--block-country <code>`  | Never these countries.                                             |
| `--block <category>`      | Never `tor`, `vpn`, `datacenter` or `blocklist` addresses.         |
| `--password <password>`   | HTTP only. Visitors get a password prompt, `curl -u any:<password>` works. |
| `--require-login`         | HTTP only. Visitors sign in with the tunlit admin account.         |

All flags repeat or take comma-separated values. Block rules win over allow rules. `--password` and `--require-login`
are mutually exclusive. Rules can be changed later in the web UI, the CLI prints the new rules and they survive a reconnect.

While the tunnel is open the CLI shows a terminal UI: the public address, live request rate, p50 and p90, and a table
of requests with status, duration, client address and location. Arrow keys select a row, `c` copies the URL, `o`
opens it in the browser, `d` opens the tunnel in the web UI, `q` quits.

Pass `--plain` to get one line per request instead, which is also what you get when the output is not a terminal:

```
GET  200 /            3ms  DE · Hetzner Online · datacenter
GET  404 /favicon.ico 1ms  US · Comcast
WS   101 /socket      4210ms  NL · Tor · tor
```

The same requests are kept server-side and shown in the web UI, with their headers and bodies; WebSocket connections
show their messages. From there requests can be replayed, or everything exported as a HAR file for browser devtools.

Options:

| Flag            | Description                                                                                                                                                                                                                                  |
|-----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--name <name>` | Request a custom id (`a-z`, `0-9`, `-`, 3-32 characters). Fails if it is taken or [reserved](/persistent) by someone else.                                                                                                                   |
| `--keep-host`   | Send the public hostname as `Host` to your app instead of `192.168.1.5:8080`. By default the local authority is sent so dev servers like Vite or Django don't reject the request; the public host is always available in `X-Forwarded-Host`. |

### Direct TCP + UDP

```sh
tunlit tcp 25565
```

```
✓ Tunnel k3x9ab is online
  Forwarding 127.0.0.1:25565 (tcp+udp)
  Share code: k3x9abQ7wRkZb2m9pLdXe8vC4nHtY1sK
  Others run: tunlit connect k3x9abQ7wRkZb2m9pLdXe8vC4nHtY1sK --server https://tunlit.example.com

  [QR code]
✓ Copied to clipboard
Press Ctrl+C to stop.
```

TCP and UDP on the target port are forwarded automatically, there is no flag to pick one. Several people can use the
same share code at once.

### Connecting to a shared port

```sh
tunlit connect https://tunlit.example.com/@tunlit/connect/k3x9abQ7wRkZb2m9pLdXe8vC4nHtY1sK
```

That link is what `tunlit tcp` prints and copies to the clipboard: it carries the server and the code together,
so the other side pastes one thing and needs nothing else. Opening it in a browser shows the same command with a
copy button.

```
✓ Forwarding 127.0.0.1:25565 (tcp+udp) → k3x9ab
Press Ctrl+C to stop.
```

`connect` needs **no account and no device token**: the link is enough. A bare share code works too, as long as
the server is known from `--server`, `TUNLIT_SERVER` or an earlier `tunlit login`. It binds a TCP listener and a
UDP socket on the same local port. By default that is the owner's
port number; if it is taken you are asked for another one.

| Flag             | Description                                                                                                   |
|------------------|---------------------------------------------------------------------------------------------------------------|
| `--port <port>`  | Local port to bind instead of the owner's port.                                                               |
| `--bind <addr>`  | Local address to bind (default `127.0.0.1`). Use `0.0.0.0` to let other machines in your LAN use the forward. |
| `--server <url>` | tunlit server URL. Only needed when a bare code was pasted instead of the link.                               |

### Listing tunnels

```sh
tunlit ls
```

Your tunnels on the server, online or not, with their addresses. Persistent ones are marked with `*`.
`tunlit status` does the same.

### Configuration

```sh
tunlit config show
tunlit config get server-url
tunlit config set server-url https://tunlit.example.com
tunlit config set device-token <token>
tunlit config set accept-invalid-certs true
```

Keys: `server-url`, `device-token` (shown as `(set)`), `accept-invalid-certs` (for self-signed certificates on the
server).

### Logout

```sh
tunlit logout
```

Removes this device's token; the server URL is kept. Revoke it on the server too, under Settings › Devices.

## Reconnects

An **administrator closing the tunnel**, or disconnecting a client from the web UI, ends the session for good: the
CLI prints the reason and exits. Reconnecting only applies to connections that dropped on their own.

If the connection to the server drops, the CLI shows a spinner and reconnects with exponential backoff. As long as it
gets back within the server's grace period (30 s by default) the tunnel keeps its id, URL and share code and joiners
stay connected. Visitors see a "tunnel offline, reconnecting" page in the meantime.

Ctrl+C tells the server to release the tunnel immediately, without waiting for the grace period.
