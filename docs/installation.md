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
the plain binary in `/usr/local/bin` everywhere else. On Linux it picks the static build when the system is older
than glibc 2.35, has no glibc at all, or runs on ARMv7 or RISC-V. The manual steps follow.

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

Both repositories carry x86-64, ARM64, ARMv7 and RISC-V, and `apt upgrade` or `dnf upgrade` keeps the CLI current
from then on. The ARMv7 and RISC-V packages hold the static CLI without the desktop app.

### Windows

Download and run
[tunlit-x64.msi](https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-x64.msi), or
[tunlit-arm64.msi](https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-arm64.msi) on ARM64. It installs to
`Program Files`, puts `tunlit` on your `PATH`, adds **tunlit** to the Start menu and registers `tunlit://` links,
so the **Open in tunlit** button on a share page opens the desktop app.

Prefer no installer?
[tunlit-windows-x64.exe](https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-windows-x64.exe) and
[tunlit-windows-arm64.exe](https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-windows-arm64.exe) are
the same binary without one.

### macOS, or any other Linux

One binary, no installer:

```sh
curl -Lo tunlit https://github.com/gnmyt/tunlit/releases/latest/download/tunlit-macos-arm64
chmod +x tunlit && sudo mv tunlit /usr/local/bin/
```

Swap the file name for the build you need: `tunlit-macos-arm64`, `tunlit-macos-x64`, `tunlit-linux-x64` or
`tunlit-linux-arm64`. The Linux files need glibc 2.35 or newer. The static builds `tunlit-linux-x64-static`,
`tunlit-linux-arm64-static`, `tunlit-linux-armv7-static` and `tunlit-linux-riscv64-static` run on any Linux, including
Alpine and older distributions, and leave out the desktop app.

### Updating

```sh
tunlit update
```

Replaces a plain binary in place, or downloads and runs the new installer on Windows. When tunlit came from a package
manager it says so and leaves updating to it. The CLI checks for a new release once a day and mentions
it in the terminal UI, the desktop app shows an **Update and restart** button under Settings.

Then log in:

```sh
tunlit login
```

Or open the desktop app with `tunlit gui` and link the device there. `tunlit links register` makes `tunlit://`
links open in it.

Continue with the [CLI guide](/cli).
