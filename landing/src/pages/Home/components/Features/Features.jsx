import "./styles.sass";
import RequestDetail from "@/common/assets/request-detail.png";
import Connect from "@/common/assets/connect.png";
import Tunnels from "@/common/assets/tunnels.png";

const features = [
    {
        title: "See every request.",
        text: "Traffic is listed while it happens. Open a request to read its headers and body, and the response that went back.",
        points: ["Method, path, status and duration", "Request and response bodies", "Live throughput per tunnel"],
        image: RequestDetail,
        alt: "A single request with its headers and JSON response",
    },
    {
        title: "Share a port with anyone.",
        text: "A tunlit tcp tunnel gets a share code. Whoever you send it to opens the link, and the port appears on their machine. No account needed.",
        points: ["TCP and UDP on the same port", "QR code for a phone or console", "Opens straight into the CLI"],
        image: Connect,
        alt: "The page behind a share link",
    },
    {
        title: "Decide who gets in.",
        text: "Each tunnel can ask for a password, a tunlit account or come from an allowed IP range. Team accounts sign in with TOTP, passkeys or your OIDC provider.",
        points: ["Password, account or IP allowlist", "TOTP, passkeys and single sign-on", "Reconnects on its own"],
        image: Tunnels,
        alt: "The tunnel list",
    },
];

export const Features = () => (
    <section className="section container">
        <div className="features">
            {features.map((feature, index) => (
                <div className={`feature${index % 2 ? " feature-reverse" : ""}`} key={feature.title}>
                    <div className="feature-text">
                        <h2>{feature.title}</h2>
                        <p>{feature.text}</p>
                        <ul>
                            {feature.points.map(point => <li key={point}>{point}</li>)}
                        </ul>
                    </div>
                    <img src={feature.image} alt={feature.alt} draggable={false} />
                </div>
            ))}
        </div>
    </section>
);
