# 📌 Persistent tunnels

A persistent tunnel is a name reserved for your account. Nobody else can use it, its access rules are kept, and it
can have custom domains. The target still comes from the CLI each time:

```sh
tunlit http 3000 --name myapp
```

Reserve a name under **Tunnels → Reserve a name**, or press **Keep** on a running tunnel. **Release** makes it an
ordinary tunnel again. To keep it up without a terminal, see [Running as a service](/service).

## Custom domains

1. Create a `CNAME` for the hostname pointing at your base domain.
2. Add the hostname on the tunnel's page.

tunlit checks DNS every few minutes and activates the domain once it resolves to the server. Traffic on it is
proxied like a subdomain tunnel, in both forwarding modes.

| `tlsMode` | Certificate                                                                     |
|-----------|---------------------------------------------------------------------------------|
| `acme`    | Issued by tunlit over the HTTP challenge, served by SNI, renewed automatically. |
| `proxy`   | Your reverse proxy handles it, see [Reverse proxy](/reverse-proxy).             |

Hostnames under the base domain are not allowed; those are subdomain tunnels.
