import "./styles.sass";

const modes = [
    {
        title: "Subdomain",
        command: "tunlit http 3000",
        result: "https://k3x9ab.tunlit.example.com",
        text: "The classic experience. Every tunnel gets its own hostname, with WebSockets and redirects handled for you.",
    },
    {
        title: "Path",
        command: "tunlit http 3000",
        result: "https://tunlit.example.com/@k3x9ab",
        text: "No wildcard certificate needed. Opening the link binds that browser tab to the tunnel, so two tabs can hold two apps.",
    },
    {
        title: "TCP + UDP",
        command: "tunlit tcp 25565",
        result: "tunlit connect <code>",
        text: "No website at all. The other side runs one command and the port shows up on their machine, TCP and UDP together.",
    },
];

export const Modes = () => (
    <section className="section container">
        <div className="section-head">
            <h2>Three ways out.</h2>
            <p>HTTP tunnels land on a subdomain or under a path, depending on how the server is set up. Everything else goes through a share code.</p>
        </div>
        <div className="modes">
            {modes.map(mode => (
                <div className="mode" key={mode.title}>
                    <h3>{mode.title}</h3>
                    <p>{mode.text}</p>
                    <div className="mode-code">
                        <code><span>$</span> {mode.command}</code>
                        <code className="mode-result">{mode.result}</code>
                    </div>
                </div>
            ))}
        </div>
    </section>
);
