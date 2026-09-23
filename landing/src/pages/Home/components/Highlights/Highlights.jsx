import "./styles.sass";

const highlights = [
    { title: "One public port", text: "HTTP, WebSockets and the CLI's own connection share a single port. Nothing else to open." },
    { title: "HTTPS either way", text: "Sit behind the proxy you already run, or let tunlit get its certificates from Let's Encrypt." },
    { title: "Static files too", text: "tunlit http ./dist serves a folder with a built-in file server. No local web server needed." },
    { title: "Reconnects", text: "Drop the Wi-Fi, close the lid. The tunnel comes back on its own with the same address." },
    { title: "Small footprint", text: "A Node.js server with one SQLite file, and a single static Rust binary for the CLI." },
    { title: "Open source", text: "MIT licensed. Run it for yourself, your team or your company." },
];

export const Highlights = () => (
    <section className="section container">
        <div className="section-head">
            <h2>The rest of it.</h2>
        </div>
        <div className="highlights">
            {highlights.map(item => (
                <div className="highlight" key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                </div>
            ))}
        </div>
    </section>
);
