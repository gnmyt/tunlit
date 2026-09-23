# 🔁 Running as a service

`tunlit start` runs every tunnel from one file and reconnects on its own. `tunlit service install` makes it start
with your session.

## The file

`~/.config/tunlit/tunnels.yml` on Linux, `~/Library/Application Support/tunlit/tunnels.yml` on macOS,
`%APPDATA%\tunlit\tunnels.yml` on Windows. Each key is the tunnel name:

```yaml
tunnels:
  myapp:
    http: 3000
  site:
    serve: /var/www/site
    password: hunter2
  shop:
    http: 3000
    routes:
      /api: 4000
      /docs: /var/www/docs
  db:
    tcp: 5432
    allow: [ 10.0.0.0/8 ]
    block: [ tor, vpn ]
```

| Key                             | Description                                                                                                    |
|---------------------------------|----------------------------------------------------------------------------------------------------------------|
| `http`                          | A port, `host:port` or `https://host[:port]`.                                                                  |
| `serve`                         | A directory to serve.                                                                                          |
| `tcp`                           | A port or `host:port`, shared with a code.                                                                     |
| `routes`                        | Prefix to port, `host:port` or directory, see [Routing by path](/cli#routing-by-path).                         |
| `shape`                         | `latency`, `jitter`, `bandwidth`, `loss`, see [Simulating a bad connection](/cli#simulating-a-bad-connection). |
| `keep_host`                     | Send the public hostname as `Host` (HTTP only).                                                                |
| `allow` / `allow_countries`     | Only these addresses or countries.                                                                             |
| `block_ips` / `block_countries` | Never these addresses or countries.                                                                            |
| `block`                         | `tor`, `vpn`, `datacenter`, `blocklist`.                                                                       |
| `password` / `require_login`    | Sign-in for visitors (HTTP only).                                                                              |

Names should be [persistent](/persistent), otherwise they are free for anyone while the service is down.

```sh
tunlit start                      # foreground, Ctrl+C stops everything
tunlit start --config other.yml
```

## Installing

```sh
tunlit service install
tunlit service uninstall
```

| System  | What it installs                                                                                                         |
|---------|--------------------------------------------------------------------------------------------------------------------------|
| Linux   | systemd user unit, `journalctl --user -u tunlit -f` for logs. Linger is enabled so it also runs without a login session. |
| macOS   | Launch agent, logs in `~/Library/Logs/tunlit.log`.                                                                       |
| Windows | Scheduled task that runs at logon.                                                                                       |

The device has to be linked (`tunlit login`) first; the file is created with an example if it is missing.
