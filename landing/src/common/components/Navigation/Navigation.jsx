import "./styles.sass";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import TunlitLogo from "@/common/components/TunlitLogo";
import GithubMark from "@/common/components/GithubMark";
import { DOCS_URL, GITHUB_URL } from "@/common/utils/links.js";

export const Navigation = () => {
    const [open, setOpen] = useState(false);
    const location = useLocation();

    useEffect(() => setOpen(false), [location]);

    const links = (
        <>
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Home</NavLink>
            <NavLink to="/install" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>Install</NavLink>
            <a className="nav-link" href={DOCS_URL} target="_blank" rel="noreferrer">Docs <ArrowUpRight /></a>
        </>
    );

    return (
        <header className="nav">
            <div className="nav-inner">
                <Link to="/" className="nav-brand">
                    <TunlitLogo size={26} />
                    <span>tunlit</span>
                </Link>
                <nav className="nav-links">{links}</nav>
                <a className="nav-github" href={GITHUB_URL} target="_blank" rel="noreferrer">
                    <GithubMark />
                    <span>GitHub</span>
                </a>
                <button type="button" className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Menu">
                    {open ? <X /> : <Menu />}
                </button>
            </div>
            {open && <nav className="nav-mobile">{links}</nav>}
        </header>
    );
};
