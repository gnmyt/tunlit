import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, LogOut } from "lucide-react";
import GithubMark from "@/common/components/GithubMark";
import TunlitLogo from "@/common/components/TunlitLogo";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import { useUser } from "@/common/contexts/user.js";
import { getNavigation } from "@/common/utils/navigationConfig.js";
import { DOCS_URL, GITHUB_URL } from "@/App.jsx";

export const TopNav = () => {
    const { user, logout } = useUser();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [logoutOpen, setLogoutOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handleClick = event => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen]);

    return (
        <header className="topnav">
            <ActionConfirmDialog open={logoutOpen} setOpen={setLogoutOpen} onConfirm={logout}
                                 title="Log out" text="You will need to sign in again." confirmText="Log out" />
            <div className="topnav-inner">
                <div className="topnav-brand" onClick={() => navigate("/tunnels")}>
                    <TunlitLogo size={26} />
                    <span className="wordmark">tunl<em>it</em></span>
                </div>
                <nav className="topnav-links">
                    {getNavigation().map(({ key, path, title, icon: Glyph }) => (
                        <NavLink key={key} to={path} className={({ isActive }) => `topnav-link${isActive ? " active" : ""}`}>
                            <Glyph size={15} />{title}
                        </NavLink>
                    ))}
                </nav>
                <div className="topnav-account" ref={menuRef}>
                    <button type="button" className={`topnav-user${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen(!menuOpen)}>
                        <span className="topnav-avatar">{user?.username?.[0]?.toUpperCase()}</span>
                        <span className="topnav-username">{user?.username}</span>
                        <ChevronDown />
                    </button>
                    {menuOpen && (
                        <div className="topnav-menu">
                            <a className="topnav-menu-item" href={DOCS_URL} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
                                <BookOpen />Documentation
                            </a>
                            <a className="topnav-menu-item" href={GITHUB_URL} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
                                <GithubMark />GitHub
                            </a>
                            <div className="topnav-menu-divider" />
                            <button type="button" className="topnav-menu-item danger" onClick={() => { setMenuOpen(false); setLogoutOpen(true); }}>
                                <LogOut />Log out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
