import "./styles.sass";
import { ArrowRight } from "lucide-react";
import Button from "@/common/components/Button";
import GithubMark from "@/common/components/GithubMark";
import Modes from "@/pages/Home/components/Modes";
import Features from "@/pages/Home/components/Features";
import Demos from "@/pages/Home/components/Demos";
import Highlights from "@/pages/Home/components/Highlights";
import GetStarted from "@/pages/Home/components/GetStarted";
import { GITHUB_URL } from "@/common/utils/links.js";
import RequestDetail from "@/common/assets/request-detail.png";

export const Home = () => (
    <div className="home">
        <section className="hero container">
            <h1>Expose a local port.<br />On your own server.</h1>
            <p>
                tunlit is a self-hosted alternative to ngrok. HTTP, WebSockets, TCP and UDP all go
                through one public port on a machine you control.
            </p>
            <div className="hero-actions">
                <Button text="Get started" icon={ArrowRight} to="/install" size="lg" />
                <Button text="GitHub" icon={GithubMark} href={GITHUB_URL} type="secondary" size="lg" />
            </div>
            <div className="hero-terminal">
                <span className="prompt">$</span> tunlit http 3000
                <span className="hero-terminal-out">https://k3x9ab.tunlit.example.com</span>
            </div>
            <img className="hero-image" src={RequestDetail} alt="Live traffic with a request opened in the side panel" draggable={false} />
        </section>

        <Demos />
        <Modes />
        <Features />
        <Highlights />
        <GetStarted />
    </div>
);
