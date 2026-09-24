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
mounted volume (see [Configuration](/configuration)).

## ⌨️ CLI

One line on Linux and macOS:

```sh
curl -fsSL https://tunlit.dev/install | sh
```

And on Windows:

```powershell
irm https://tunlit.dev/install.ps1 | iex
```

The script adds the package repository on Debian, Ubuntu, Fedora and RHEL, runs the installer on Windows and puts
the plain binary in `/usr/local/bin` everywhere else. It stops with a message on architectures other than x86-64
and ARM64. The manual steps follow.

### Debian, Ubuntu

```sh
curl -fsSL https://packages.buildkite.com/tunlit/apt/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/tunlit.gpg
echo "deb [signed-by=/usr/share/keyrings/tunlit.gpg] https://packages.buildkite.com/tunlit/apt/any/ any main" | sudo tee /etc/apt/sources.list.d/tunlit.list
sudo apt update
sudo apt install tunlit-cli
```

### Fedora, RHEL

```sh
sudo tee /etc/yum.repos.d/tunlit.repo > /dev/null <<'EOF'
[tunlit]
name=tunlit
baseurl=https://packages.buildkite.com/tunlit/rpm/rpm_any/rpm_any/$basearch
gpgkey=https://packages.buildkite.com/tunlit/rpm/gpgkey
repo_gpgcheck=1
gpgcheck=0
enabled=1
EOF

sudo dnf install tunlit-cli
```

Both repositories carry x86-64 and ARM64, and `apt upgrade` or `dnf upgrade` keeps the CLI current from then on.

### Windows

Download and run
[tunlit-x64.msi](https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-x64.msi). It installs to
`Program Files`, puts `tunlit` on your `PATH`, adds **tunlit** to the Start menu and registers `tunlit://` links,
so the **Open in tunlit** button on a share page opens the desktop app.

Prefer no installer?
[tunlit.exe](https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-windows-x64.exe) is the same binary
without one.

### macOS, or any other Linux

One binary, no installer:

```sh
curl -Lo tunlit https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-macos-arm64
chmod +x tunlit && sudo mv tunlit /usr/local/bin/
```

Swap the file name for the build you need: `tunlit-macos-arm64`, `tunlit-macos-x64`, `tunlit-linux-x64` or
`tunlit-linux-arm64`.

Then log in:

```sh
tunlit login
```

Or open the desktop app with `tunlit gui` and link the device there. `tunlit links register` makes `tunlit://`
links open in it.

Continue with the [CLI guide](/cli).
