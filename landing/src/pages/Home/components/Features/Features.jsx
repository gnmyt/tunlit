import "./styles.sass";
import Tunnels from "@/common/assets/tunnels.png";
import Connect from "@/common/assets/connect.png";
import TunnelDetail from "@/common/assets/tunnel-detail.png";

const features = [
    {
        title: "Every tunnel on one page.",
        text: "Start one from the CLI and it shows up here with its address, owner and age. Reserve a name to keep it.",
        points: ["Subdomain, path and TCP tunnels", "Persistent names with your own domains", "Per-account quotas"],
        image: Tunnels,
        alt: "The tunnel list",
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
        text: "Each tunnel can ask for a password or a tunlit account, allow only some addresses or countries, and block Tor, VPNs and datacenters. Team accounts sign in with TOTP, passkeys or your OIDC provider.",
        points: ["Allow and block by address or country", "Tor, VPN and datacenter filters", "TOTP, passkeys and single sign-on"],
        image: TunnelDetail,
        alt: "A tunnel with its access rules and live throughput",
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
