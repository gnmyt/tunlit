# ⚙️ Configuration

The server reads a YAML file (`/app/data/config.yml` in the image, override the path with `TUNLIT_CONFIG`). Every
key can also be set through an environment variable, which beats the file, and anything you save in the web UI
beats both.

Nothing is required up front. Without a `baseDomain` the server starts in **setup mode** and serves only
`/@tunlit/**` until you finish the setup wizard in the browser.

```yaml
listen: 0.0.0.0
port: 8080
baseDomain: tunlit.example.com
publicUrl: https://tunlit.example.com
trustProxy: true
httpMode: subdomain
gracePeriod: 30
```

| Key | Environment variable | Default | Description |
|---|---|---|---|
| `listen` | `TUNLIT_LISTEN` | `0.0.0.0` | Address the HTTP server binds to. |
| `port` | `TUNLIT_PORT` | `8080` | The one and only port. HTTP, WebSockets and the CLI control channel all use it. |
| `baseDomain` | `TUNLIT_BASE_DOMAIN` | - (setup) | Your tunnel domain. Subdomain tunnels become `<id>.<baseDomain>`, path-mode tunnels live on `<baseDomain>` itself. |
| `publicUrl` | `TUNLIT_PUBLIC_URL` | `https://<baseDomain>` | What the server prints as the public URL. Use `http://…` for local testing without TLS. |
| `tlsMode` | `TUNLIT_TLS_MODE` | `proxy` | `proxy` if something terminates TLS in front of tunlit, `acme` if tunlit should get its own certificates. See [HTTPS](/https). |
| `trustProxy` | `TUNLIT_TRUST_PROXY` | `false` | Use `X-Forwarded-Host`, `X-Forwarded-Proto` and `X-Forwarded-For` from nginx. Turn this on only when nothing but your proxy can reach the port: the IP allowlist and the login rate limit both believe whatever address these headers carry. |
| `httpMode` | `TUNLIT_HTTP_MODE` | `subdomain` | How `tunlit http` tunnels are exposed. `subdomain`: `https://<id>.<baseDomain>` (needs the wildcard DNS record and certificate). `path`: `https://<baseDomain>/@<id>`, bound per browser tab (no wildcard needed). |
| `gracePeriod` | `TUNLIT_GRACE_PERIOD` | `30` | Seconds a tunnel id stays reserved after the owner's CLI drops. The CLI reconnects automatically and keeps the same URL/share code. Ctrl+C releases immediately. |

`listen` and `port` are only read at startup. Everything else can be changed in the web UI and takes effect
immediately.

Other environment variables:

| Variable | Description |
|---|---|
| `TUNLIT_CONFIG` | Path to the YAML file. |
| `TUNLIT_DATA_DIR` | Where the database is kept. `/app/data` in the image. |
| `LOG_LEVEL` | `error`, `warn`, `info` (default) or `debug`. |

## 💾 Data directory

The data directory (`/app/data`, or `TUNLIT_DATA_DIR`) holds one file, `tunlit.db`: accounts, sessions, devices,
tunnel access rules, certificates, the requests a tunnel has served and the settings you changed in the web UI.

It is SQLite. Passwords are scrypt hashes and device tokens are stored hashed, so a copy of the file does not hand
anyone a working login. The schema is created and upgraded automatically on startup.

Only settings you actually change in the UI are stored; anything you leave alone keeps coming from `config.yml` or
the environment, which is why server configuration stays reviewable in a file you can put in git.

![Forwarding settings](/screenshots/settings.png)

Back it up (or mount `/app/data` in Docker) to keep accounts, devices and access rules across restarts. Delete it
to start over with the setup wizard.
