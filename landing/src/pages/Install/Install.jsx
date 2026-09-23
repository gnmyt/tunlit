import "./styles.sass";
import { useState } from "react";
import CodeBlock from "@/common/components/CodeBlock";
import { detectOs } from "@/common/utils/platform.js";
import { DOCS_URL, GITHUB_URL } from "@/common/utils/links.js";

const DOWNLOAD = `${GITHUB_URL}/releases/latest/download`;

const SERVER = {
    docker: {
        title: "Terminal",
        code: `docker run -d \\
  --name tunlit \\
  --restart always \\
  -p 127.0.0.1:8080:8080 \\
  -v tunlit-data:/app/data \\
  -e TUNLIT_BASE_DOMAIN=tunlit.example.com \\
  -e TUNLIT_PUBLIC_URL=https://tunlit.example.com \\
  -e TUNLIT_TRUST_PROXY=true \\
  germannewsmaker/tunlit:latest`,
    },
    compose: {
        title: "docker-compose.yml",
        code: `services:
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
  tunlit-data:`,
    },
};

const CLI = {
    linux: {
        label: "Linux",
        blocks: [
            {
                title: "Debian, Ubuntu",
                code: `curl -fsSL https://packages.buildkite.com/tunlit/apt/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/tunlit.gpg
echo "deb [signed-by=/usr/share/keyrings/tunlit.gpg] https://packages.buildkite.com/tunlit/apt/any/ any main" | sudo tee /etc/apt/sources.list.d/tunlit.list
sudo apt update
sudo apt install tunlit-cli`,
            },
            {
                title: "Fedora, RHEL",
                code: `sudo tee /etc/yum.repos.d/tunlit.repo > /dev/null <<'EOF'
[tunlit]
name=tunlit
baseurl=https://packages.buildkite.com/tunlit/rpm/rpm_any/rpm_any/$basearch
gpgkey=https://packages.buildkite.com/tunlit/rpm/gpgkey
repo_gpgcheck=1
gpgcheck=0
enabled=1
EOF

sudo dnf install tunlit-cli`,
            },
            {
                title: "Any other Linux",
                code: `curl -Lo tunlit ${DOWNLOAD}/tunlit-linux-x64
chmod +x tunlit && sudo mv tunlit /usr/local/bin/`,
            },
        ],
        note: "Both repositories carry x86-64 and ARM64. For the plain binary, take tunlit-linux-arm64 on ARM.",
    },
    macos: {
        label: "macOS",
        blocks: [
            {
                title: "Apple Silicon",
                code: `curl -Lo tunlit ${DOWNLOAD}/tunlit-macos-arm64
chmod +x tunlit && sudo mv tunlit /usr/local/bin/`,
            },
            {
                title: "Intel",
                code: `curl -Lo tunlit ${DOWNLOAD}/tunlit-macos-x64
chmod +x tunlit && sudo mv tunlit /usr/local/bin/`,
            },
        ],
    },
    windows: {
        label: "Windows",
        blocks: [],
        download: { label: "Download tunlit-x64.msi", url: `${DOWNLOAD}/tunlit-x64.msi` },
        note: "The installer puts tunlit on your PATH and registers tunlit:// links, so a share page can open the CLI directly. Prefer no installer? tunlit-windows-x64.exe is the same binary on its own.",
    },
};

const USAGE = `tunlit login          # link this machine to your server, once
tunlit http 3000      # share a local port
tunlit http ./dist    # or a folder
tunlit tcp 5432       # anything that is not HTTP`;

export const Install = () => {
    const [server, setServer] = useState("docker");
    const [os, setOs] = useState(() => detectOs() || "linux");
    const cli = CLI[os];

    return (
        <div className="install container">
            <header className="install-head">
                <h1>Install tunlit.</h1>
                <p>The server runs where you have a public address. The CLI runs wherever the thing you want to share lives.</p>
            </header>

            <section className="install-step">
                <div className="install-step-head">
                    <h2>1. The server</h2>
                    <div className="switcher">
                        <button type="button" className={server === "docker" ? "active" : ""} onClick={() => setServer("docker")}>docker run</button>
                        <button type="button" className={server === "compose" ? "active" : ""} onClick={() => setServer("compose")}>Compose</button>
                    </div>
                </div>
                <CodeBlock title={SERVER[server].title} code={SERVER[server].code} />
                <p className="install-note">
                    Then open <code>https://tunlit.example.com/@tunlit</code> and the setup wizard takes it from there.
                    These examples sit behind a reverse proxy. tunlit can also hold its own certificate, see{" "}
                    <a href={`${DOCS_URL}/https`} target="_blank" rel="noreferrer">HTTPS</a>.
                </p>
            </section>

            <section className="install-step">
                <div className="install-step-head">
                    <h2>2. The CLI</h2>
                    <div className="switcher">
                        {Object.entries(CLI).map(([key, entry]) => (
                            <button type="button" key={key} className={os === key ? "active" : ""} onClick={() => setOs(key)}>{entry.label}</button>
                        ))}
                    </div>
                </div>
                <div className="install-blocks">
                    {cli.download && <a className="install-download" href={cli.download.url}>{cli.download.label}</a>}
                    {cli.blocks.map(block => <CodeBlock key={block.title} title={block.title} code={block.code} />)}
                </div>
                {cli.note && <p className="install-note">{cli.note}</p>}
            </section>

            <section className="install-step">
                <div className="install-step-head">
                    <h2>3. Share something</h2>
                </div>
                <CodeBlock title="Terminal" code={USAGE} />
            </section>

            <nav className="install-links">
                <a href={`${DOCS_URL}/configuration`} target="_blank" rel="noreferrer">Configuration</a>
                <a href={`${DOCS_URL}/reverse-proxy`} target="_blank" rel="noreferrer">Reverse proxy</a>
                <a href={`${DOCS_URL}/cli`} target="_blank" rel="noreferrer">CLI reference</a>
                <a href={DOCS_URL} target="_blank" rel="noreferrer">All documentation</a>
            </nav>
        </div>
    );
};
