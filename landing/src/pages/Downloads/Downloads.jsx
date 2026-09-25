import "./styles.sass";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Download } from "lucide-react";
import CodeBlock from "@/common/components/CodeBlock";
import { AppleIcon, LinuxIcon, WindowsIcon } from "@/common/components/BrandIcons";
import { detectOs } from "@/common/utils/platform.js";
import { DOCS_URL, GITHUB_URL, RELEASES_URL } from "@/common/utils/links.js";

const DOWNLOAD = `${GITHUB_URL}/releases/latest/download`;
const RELEASE_API = "https://api.github.com/repos/gnmyt/tunlit/releases/latest";

const file = (name, label) => ({ url: `${DOWNLOAD}/${name}`, label });

const PLATFORMS = [
    {
        id: "windows",
        name: "Windows",
        icon: WindowsIcon,
        command: "irm https://tunlit.dev/install.ps1 | iex",
        primary: file("tunlit-x64.msi", "Installer, x64"),
        groups: [{ title: "Also", files: [file("tunlit-arm64.msi", "Installer, ARM64"), file("tunlit-windows-x64.exe", "tunlit.exe, x64"), file("tunlit-windows-arm64.exe", "tunlit.exe, ARM64")] }],
    },
    {
        id: "macos",
        name: "macOS",
        icon: AppleIcon,
        command: "curl -fsSL https://tunlit.dev/install | sh",
        primary: file("tunlit-macos-arm64", "Apple Silicon"),
        groups: [{ title: "Also", files: [file("tunlit-macos-x64", "Intel")] }],
    },
    {
        id: "linux",
        name: "Linux",
        icon: LinuxIcon,
        command: "curl -fsSL https://tunlit.dev/install | sh",
        primary: file("tunlit-linux-x64", "Binary, x64"),
        groups: [
            { title: "Also", files: [file("tunlit-linux-arm64", "Binary, ARM64")] },
            { title: "Packages", files: [file("tunlit-cli-amd64.deb", "deb, amd64"), file("tunlit-cli-arm64.deb", "deb, arm64"), file("tunlit-cli-x86_64.rpm", "rpm, x86_64"), file("tunlit-cli-aarch64.rpm", "rpm, aarch64")] },
            { title: "Static, no desktop app", files: [file("tunlit-linux-x64-static", "x64"), file("tunlit-linux-arm64-static", "ARM64"), file("tunlit-linux-armv7-static", "ARMv7"), file("tunlit-linux-riscv64-static", "RISC-V")] },
        ],
    },
];

const USAGE = `tunlit login          # link this machine to your server, once
tunlit http 3000      # share a local port
tunlit gui            # or use the desktop app`;

const Files = ({ groups }) => (
    <div className="platform-groups">
        {groups.map(group => (
            <div className="platform-group" key={group.title}>
                <span>{group.title}</span>
                <div className="platform-files">
                    {group.files.map(entry => <a key={entry.url} className="btn btn-secondary" href={entry.url}>{entry.label}</a>)}
                </div>
            </div>
        ))}
    </div>
);

export const Downloads = () => {
    const [version, setVersion] = useState(null);
    const detected = detectOs() || "linux";
    const featured = PLATFORMS.find(platform => platform.id === detected);
    const others = PLATFORMS.filter(platform => platform.id !== detected);

    useEffect(() => {
        fetch(RELEASE_API).then(response => (response.ok ? response.json() : null)).then(release => setVersion(release?.tag_name)).catch(() => null);
    }, []);

    return (
        <div className="downloads container">
            <section className="featured">
                <div className="featured-text">
                    <featured.icon size={40} />
                    <h1>tunlit for {featured.name}.</h1>
                    <p>One binary: CLI, terminal UI and desktop app.</p>
                    <a className="btn btn-primary btn-lg" href={featured.primary.url}><Download /><span>{featured.primary.label}</span></a>
                    <a className="downloads-version" href={RELEASES_URL} target="_blank" rel="noreferrer">
                        {version ? `Latest release ${version}` : "Latest release"} <ArrowUpRight />
                    </a>
                </div>
                <div className="featured-side">
                    <CodeBlock title="One line" code={featured.command} />
                    <Files groups={featured.groups} />
                </div>
            </section>

            <section className="others">
                <h2>Other systems</h2>
                <div className="platforms">
                    {others.map(platform => (
                        <div className="platform" key={platform.id}>
                            <div className="platform-head">
                                <platform.icon size={22} />
                                <h3>{platform.name}</h3>
                            </div>
                            <div className="platform-body">
                                <CodeBlock title="One line" code={platform.command} />
                                <a className="btn btn-primary platform-primary" href={platform.primary.url}><Download /><span>{platform.primary.label}</span></a>
                                <Files groups={platform.groups} />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="downloads-next">
                <div className="downloads-next-text">
                    <h2>Then link it.</h2>
                    <p>The CLI talks to your own server.</p>
                    <Link to="/setup" className="btn btn-secondary">Set up a server <ArrowRight /></Link>
                </div>
                <CodeBlock title="Terminal" code={USAGE} />
            </section>

            <nav className="downloads-links">
                <a href={`${DOCS_URL}/installation`} target="_blank" rel="noreferrer">Package repositories</a>
                <a href={`${DOCS_URL}/cli`} target="_blank" rel="noreferrer">CLI reference</a>
                <a href={RELEASES_URL} target="_blank" rel="noreferrer">All releases</a>
            </nav>
        </div>
    );
};
