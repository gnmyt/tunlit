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

### Protecting a tunnel

A tunnel can be restricted from the moment it is created:

```sh
tunlit http 3000 --password hunter2          # ask visitors for a password
tunlit http 3000 --require-login             # ask visitors for a tunlit account
tunlit serve --allow 10.0.0.0/8              # only this range may connect
tunlit tcp 25565 --allow 203.0.113.5         # same, for a direct tcp tunnel
```

| Flag | Description |
|---|---|
| `--allow <cidr>` | Repeatable. A single address or a CIDR range. With none set, anyone may connect. Applies to every mode, including who may use a `tunlit tcp` share code. |
| `--password <password>` | HTTP tunnels only. Visitors get a password prompt; scripts can use `curl -u any:<password>`. |
| `--require-login` | HTTP tunnels only. Visitors sign in with the tunlit admin account. |

`--password` and `--require-login` are mutually exclusive. All of it can also be changed later, per tunnel, in
the web UI, and the rules survive a reconnect.

While the tunnel is open, every request that passes through is printed as it completes:

```
GET  200 /            3ms
GET  404 /favicon.ico 1ms
WS   101 /socket      4210ms
```

The same requests are kept server-side and shown in the web UI, with their headers and bodies.

Options:

| Flag | Description |
|---|---|
| `--name <name>` | Request a custom id (`a-z`, `0-9`, `-`, 3-32 characters). Fails if it is taken or [reserved](/persistent) by someone else. |
| `--keep-host` | Send the public hostname as `Host` to your app instead of `192.168.1.5:8080`. By default the local authority is sent so dev servers like Vite or Django don't reject the request; the public host is always available in `X-Forwarded-Host`. |

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

| Flag | Description |
|---|---|
| `--port <port>` | Local port to bind instead of the owner's port. |
| `--bind <addr>` | Local address to bind (default `127.0.0.1`). Use `0.0.0.0` to let other machines in your LAN use the forward. |
| `--server <url>` | tunlit server URL. Only needed when a bare code was pasted instead of the link. |

### Configuration

```sh
tunlit config show
tunlit config get server-url
tunlit config set server-url https://tunlit.example.com
tunlit config set device-token <token>
tunlit config set accept-invalid-certs true
```

Keys: `server-url`, `device-token` (shown as `(set)`), `accept-invalid-certs` (for self-signed certificates on the server).

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
