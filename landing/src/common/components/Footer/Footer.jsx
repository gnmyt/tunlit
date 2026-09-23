import "./styles.sass";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import TunlitLogo from "@/common/components/TunlitLogo";
import { AUTHOR_URL, DOCS_URL, GITHUB_URL, RELEASES_URL } from "@/common/utils/links.js";

export const Footer = () => (
    <footer className="footer">
        <div className="footer-inner">
            <div className="footer-brand">
                <Link to="/" className="footer-logo">
                    <TunlitLogo size={22} />
                    <span className="wordmark">tunl<em>it</em></span>
                </Link>
                <p>Self-hosted tunnels. MIT licensed.</p>
            </div>
            <nav className="footer-links">
                <Link to="/install">Install</Link>
                <a href={DOCS_URL} target="_blank" rel="noreferrer">Documentation</a>
                <a href={RELEASES_URL} target="_blank" rel="noreferrer">Releases</a>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
                <a href={`${AUTHOR_URL}/imprint`} target="_blank" rel="noreferrer">Imprint</a>
                <a href={`${AUTHOR_URL}/privacy`} target="_blank" rel="noreferrer">Privacy</a>
            </nav>
        </div>
        <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Mathias Wagner</span>
            <span className="footer-made">
                Made with <Heart size={12} fill="currentColor" /> by{" "}
                <a href={AUTHOR_URL} target="_blank" rel="noreferrer">GNM</a>
            </span>
        </div>
    </footer>
);
