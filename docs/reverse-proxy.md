# 🔀 Reverse Proxy

> [!NOTE]
> This is one of two ways to serve HTTPS. tunlit can also get its own certificates from Let's Encrypt and
> serve them itself, with nothing in front. See [HTTPS](/https).

In this mode tunlit runs behind **nginx**, which terminates TLS for the base domain **and** every subdomain. You need:

1. A **wildcard DNS record**: `tunlit.example.com` and `*.tunlit.example.com` pointing at your server.
2. A **wildcard certificate** covering both `tunlit.example.com` and `*.tunlit.example.com`. With certbot this needs
   the DNS challenge, for example:

   ```sh
   certbot certonly --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
     -d tunlit.example.com -d '*.tunlit.example.com'
   ```

3. The nginx site below. WebSockets, unbuffered streaming and unlimited upload sizes are essential - tunnels carry
   arbitrary apps and long-lived connections.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tunlit.example.com *.tunlit.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name tunlit.example.com *.tunlit.example.com;

    ssl_certificate     /etc/letsencrypt/live/tunlit.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tunlit.example.com/privkey.pem;

    # Tunnels carry anything, including huge uploads and streams
    client_max_body_size 0;
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # WebSocket support (tunnelled apps and the CLI control channel)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;

        # Long-lived connections
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Add this once in the `http` block (usually `/etc/nginx/nginx.conf` or a file in `conf.d/`) so `Connection` is only
set to `upgrade` for real upgrade requests:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Set `trustProxy: true` in the tunlit config so the `X-Forwarded-*` headers above are used for the public host, the
`Secure` flag on session cookies and the client IP passed to your apps. It is off by default, because anyone who can
reach the port directly can otherwise put any address in `X-Forwarded-For` and walk through a tunnel's IP allowlist.
Only turn it on together with the tip below.

> [!TIP]
> Only nginx needs to reach tunlit. Bind the container to `127.0.0.1:8080:8080` so port 8080 is not exposed to
> the internet without TLS.
