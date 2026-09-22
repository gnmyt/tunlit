# 🚀 Installation

tunlit consists of the **server** (Node.js) and the **CLI** (a single Rust binary called `tunlit`).

## 🐳 Docker

```sh
docker run -d \
  --name tunlit \
  --restart always \
  -p 127.0.0.1:8080:8080 \
  -v tunlit-data:/app/data \
  -e TUNLIT_BASE_DOMAIN=tunlit.example.com \
  -e TUNLIT_PUBLIC_URL=https://tunlit.example.com \
  -e TUNLIT_TRUST_PROXY=true \
  germannewsmaker/tunlit:latest
```

Then open `https://tunlit.example.com/@tunlit` and follow the setup wizard.

> [!IMPORTANT]
> Mount `/app/data`. That volume holds your admin account, the settings you change in the web UI and the generated
> CLI token - without it they are gone when the container is recreated.

## 📦 Docker Compose

```yaml
services:
  tunlit:
    image: germannewsmaker/tunlit:latest
    restart: always
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - tunlit-data:/app/data
    environment:
      TUNLIT_BASE_DOMAIN: tunlit.example.com
      TUNLIT_PUBLIC_URL: https://tunlit.example.com
      TUNLIT_TRUST_PROXY: "true"

volumes:
  tunlit-data:
```

Prefer a file? Mount a `config.yml` to `/app/data/config.yml` instead of setting environment variables (see
[Configuration](/configuration)). Environment variables always win over the file.

> [!NOTE]
> Both examples above put a proxy in front, so they bind to `127.0.0.1` and set `TUNLIT_TRUST_PROXY`, which makes
> tunlit believe the `X-Forwarded-*` headers it receives. tunlit can hold its own certificate instead and bind 443
> itself; see [HTTPS](/https).

Then open `https://tunlit.example.com/@tunlit` and run the setup wizard, or skip it by mounting a `config.yml`
with `baseDomain` and `publicUrl` already filled in. Accounts and everything you change in the web UI live in the
mounted volume (see [Configuration](/configuration#data-directory)).

## ⌨️ CLI

Grab the binary for your platform from the [releases page](https://github.com/gnmyt/tunlit/releases)
(`tunlit-linux-x64`, `tunlit-linux-arm64`, `tunlit-macos-arm64`, `tunlit-macos-x64`, `tunlit-windows-x64.exe`), make
it executable and put it in your `$PATH`:

```sh
curl -Lo tunlit https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-linux-x64
chmod +x tunlit && sudo mv tunlit /usr/local/bin/
```

Or build it from source with Rust:

```sh
cd cli
cargo build --release
cp target/release/tunlit /usr/local/bin/
```

Then log in:

```sh
tunlit login
```

Continue with the [CLI guide](/cli).
