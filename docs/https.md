# 🔒 HTTPS

tunlit never speaks plain HTTP to the internet. Two ways to get there, and you pick one during the guided setup or
later under **Settings → HTTPS**. The options for the other one stay out of your way.

## 🧭 Which one

| | Behind a proxy | tunlit manages it |
|---|---|---|
| Certificate | your proxy holds it | tunlit orders it from Let's Encrypt |
| tunlit listens on | one plain HTTP port | `443`, plus `80` for redirects |
| Renewal | your proxy's job | automatic, 30 days before expiry |
| Needs | nginx, Caddy, Traefik… | a DNS API token, or port 80 reachable |

Pick **behind a proxy** if something already terminates TLS on that machine, or if you want one certificate for
several services. Pick **tunlit manages it** if tunlit is the only thing on the box.

## 🛡️ Behind a proxy

The default. tunlit serves plain HTTP on `port` (8080) and never sees a certificate. Set up nginx as described in
[Reverse proxy](/reverse-proxy), then turn on **Trust proxy headers** so tunnels see the real visitor address.

> [!WARNING]
> Only turn that on when nothing but your proxy can reach the port. The per-tunnel IP allowlist and the login rate
> limit both believe whatever `X-Forwarded-For` carries.

## 🔑 tunlit manages it

tunlit binds `443` for traffic and `80` for the redirect and HTTP challenges. In Docker that is just a port
mapping, because a container may bind low ports already:

```sh
docker run -d --name tunlit --restart always -p 443:443 -p 80:80 \
  -v tunlit-data:/app/data \
  -e TUNLIT_BASE_DOMAIN=tunlit.example.com \
  -e TUNLIT_PUBLIC_URL=https://tunlit.example.com \
  -e TUNLIT_TLS_MODE=acme \
  germannewsmaker/tunlit:latest
```

### Which challenge

| Forwarding mode | Certificate | Challenge |
|---|---|---|
| Path | `tunlit.example.com` | HTTP, or DNS if you prefer |
| Subdomain | `tunlit.example.com` **and** `*.tunlit.example.com` | DNS only |

A wildcard can only be proven with a DNS challenge, which is a Let's Encrypt rule rather than a tunlit one. Subdomain
forwarding therefore needs a DNS provider; path forwarding can get by with the HTTP challenge and no token at all.

### DNS providers

**Cloudflare**: create a token with `Zone:DNS:Edit` on the zone, paste it, and press *Test token*. tunlit adds and
removes the `_acme-challenge` record on its own, including at renewal.

**Add the record yourself**: tunlit shows the exact TXT record and waits. Fine for a first certificate, but
renewal needs you to be there again, so it is not a good long-term answer.

### The first certificate

Until there is one, a server in this mode serves the web UI over plain HTTP on port 80, because the page you would
request the certificate from is otherwise behind a handshake that cannot succeed. Finish the setup, open
**Settings → HTTPS**, press *Request certificate*, and the redirect takes over once it lands.

## ⚙️ Keys

| Key | Environment variable | Default | Description |
|---|---|---|---|
| `tlsMode` | `TUNLIT_TLS_MODE` | `proxy` | `proxy` or `acme`. |
| `httpsPort` | `TUNLIT_HTTPS_PORT` | `443` | Where traffic is served in `acme` mode. |
| `redirectPort` | `TUNLIT_REDIRECT_PORT` | `80` | Redirects to HTTPS and answers HTTP challenges. |
| `acmeDirectoryUrl` | `TUNLIT_ACME_DIRECTORY` | - | Another ACME server: a private CA, Buypass, or Let's Encrypt staging while you are debugging. |

The contact email, the challenge and the DNS token are set in the web UI and stored in the database, not in
`config.yml`, because a token is a credential rather than configuration.

> [!TIP]
> Let's Encrypt rate-limits failed validations to five per hostname per hour. If you are working through a DNS
> problem and hit that, point `TUNLIT_ACME_DIRECTORY` at
> `https://acme-staging-v02.api.letsencrypt.org/directory` until it works. Staging certificates come from an
> untrusted CA, so browsers will warn about them. Switch back once the challenge succeeds.
