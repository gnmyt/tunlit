import "./styles.sass";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import CodeBlock from "@/common/components/CodeBlock";
import { DOCS_URL } from "@/common/utils/links.js";

const IMAGE = "germannewsmaker/tunlit:latest";

const Switch = ({ value, onChange, options }) => (
    <div className="switcher">
        {options.map(([key, label]) => (
            <button type="button" key={key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>{label}</button>
        ))}
    </div>
);

const Option = ({ label, hint, children }) => (
    <div className="setup-option">
        <div className="setup-option-text">
            <span>{label}</span>
            {hint && <small>{hint}</small>}
        </div>
        {children}
    </div>
);

const dockerRun = ({ host, port, storage }) => [
    "docker run -d",
    "  --name tunlit",
    "  --restart always",
    host ? "  --network host" : `  -p 127.0.0.1:${port}:8080`,
    `  -v ${storage}:/app/data`,
    `  ${IMAGE}`,
].join(" \\\n");

const compose = ({ host, port, storage, named }) => [
    "services:",
    "  tunlit:",
    `    image: ${IMAGE}`,
    "    restart: always",
    ...(host ? ["    network_mode: host"] : ["    ports:", `      - "127.0.0.1:${port}:8080"`]),
    "    volumes:",
    `      - ${storage}:/app/data`,
    ...(named ? ["", "volumes:", `  ${storage}:`] : []),
].join("\n");

export const Setup = () => {
    const [host, setHost] = useState(true);
    const [method, setMethod] = useState("docker");
    const [named, setNamed] = useState(true);
    const [storage, setStorage] = useState("tunlit-data");
    const [port, setPort] = useState("8080");

    const settings = { host, port: port.trim() || "8080", storage: storage.trim() || (named ? "tunlit-data" : "./tunlit-data"), named };
    const output = method === "docker" ? dockerRun(settings) : compose(settings);

    return (
        <div className="setup container">
            <header className="setup-head">
                <h1>Set up a server.</h1>
                <p>One command, the rest happens in the browser.</p>
            </header>

            <section className="setup-step">
                <div className="setup-step-head">
                    <span className="setup-step-number">1</span>
                    <h2>Docker</h2>
                    <p>Skip this if Docker is already there.</p>
                </div>
                <CodeBlock title="Terminal" code="curl -fsSL https://get.docker.com | sh" />
            </section>

            <section className="setup-step">
                <div className="setup-step-head">
                    <span className="setup-step-number">2</span>
                    <h2>Your setup</h2>
                </div>
                <div className="setup-options">
                    <Option label="Network" hint={host ? "8080, or 443 and 80" : "8080 only, behind a proxy"}>
                        <Switch value={host ? "host" : "bridge"} onChange={value => setHost(value === "host")} options={[["host", "Host"], ["bridge", "Bridge"]]} />
                    </Option>
                    {!host && (
                        <Option label="Port">
                            <input type="text" value={port} onChange={event => setPort(event.target.value)} placeholder="8080" inputMode="numeric" />
                        </Option>
                    )}
                    <Option label="Data">
                        <div className="setup-storage">
                            <Switch value={named ? "named" : "bind"} onChange={value => { setNamed(value === "named"); setStorage(value === "named" ? "tunlit-data" : "./tunlit-data"); }} options={[["named", "Volume"], ["bind", "Folder"]]} />
                            <input type="text" value={storage} onChange={event => setStorage(event.target.value)} spellCheck={false} />
                        </div>
                    </Option>
                    <Option label="Method">
                        <Switch value={method} onChange={setMethod} options={[["docker", "docker run"], ["compose", "Compose"]]} />
                    </Option>
                </div>
            </section>

            <section className="setup-step">
                <div className="setup-step-head">
                    <span className="setup-step-number">3</span>
                    <h2>Run it</h2>
                </div>
                <CodeBlock title={method === "docker" ? "Terminal" : "docker-compose.yml"} code={output} />
                {method === "compose" && <p className="setup-note">Save it as <code>docker-compose.yml</code> and run <code>docker compose up -d</code>.</p>}
            </section>

            <section className="setup-step">
                <div className="setup-step-head">
                    <span className="setup-step-number">4</span>
                    <h2>Finish in the browser</h2>
                </div>
                <div className="setup-finish">
                    <p>Open <code>http://&lt;server&gt;:{host ? "8080" : settings.port}/@tunlit</code> and follow the wizard.</p>
                    <p><a href={`${DOCS_URL}/reverse-proxy`} target="_blank" rel="noreferrer">Reverse proxy</a> · <a href={`${DOCS_URL}/https`} target="_blank" rel="noreferrer">HTTPS</a></p>
                </div>
            </section>

            <section className="setup-next">
                <div>
                    <h2>Then the CLI.</h2>
                    <p>One binary for every system.</p>
                </div>
                <Link to="/downloads" className="btn btn-primary">Downloads <ArrowRight /></Link>
            </section>
        </div>
    );
};
