import "./styles.sass";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useUser } from "@/common/contexts/user.js";
import { AUTHOR_URL, GITHUB_URL } from "@/App.jsx";

const RELEASES_API = "https://api.github.com/repos/gnmyt/tunlit/releases/latest";
const CACHE_KEY = "tunlit.latestRelease";
const CACHE_TTL = 6 * 60 * 60 * 1000;

const parseVersion = version => String(version || "").replace(/^v/, "").split("-")[0].split(".").map(Number);

const isNewer = (candidate, current) => {
    const a = parseVersion(candidate), b = parseVersion(current);
    if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
};

const useLatestRelease = () => {
    const [latest, setLatest] = useState(null);

    useEffect(() => {
        let cancelled = false;
        try {
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
            if (cached && Date.now() - cached.at < CACHE_TTL) return setLatest(cached.version);
        } catch {
            setLatest(null);
        }

        fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } })
            .then(response => response.ok ? response.json() : null)
            .then(release => {
                if (cancelled || !release?.tag_name) return;
                setLatest(release.tag_name);
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: release.tag_name, at: Date.now() }));
                } catch {
                    return;
                }
            })
            .catch(() => null);
        return () => { cancelled = true; };
    }, []);

    return latest;
};

export const Footer = () => {
    const { serverInfo } = useUser();
    const latest = useLatestRelease();
    const version = serverInfo?.version;
    const update = version && latest && isNewer(latest, version) ? latest : null;

    return (
        <footer className="app-footer">
            <div className="app-footer-inner">
                <div className="app-footer-group">
                    <span className="app-footer-brand">tunlit</span>
                    {version && (
                        <a className="app-footer-version" href={`${GITHUB_URL}/releases/tag/v${version}`} target="_blank"
                           rel="noreferrer" title="Release notes">v{version}</a>
                    )}
                    {update && (
                        <a className="app-footer-update" href={`${GITHUB_URL}/releases/latest`} target="_blank" rel="noreferrer">
                            {update.startsWith("v") ? update : `v${update}`} available
                        </a>
                    )}
                </div>

                <span className="app-footer-group app-footer-made">
                    Made with <Heart size={12} fill="currentColor" /> by{" "}
                    <a href={AUTHOR_URL} target="_blank" rel="noreferrer">GNM</a>
                </span>
            </div>
        </footer>
    );
};
