import "./styles.sass";
import { useEffect, useState } from "react";
import { ChevronDown, Download, Waypoints } from "lucide-react";
import CopyField from "@/common/components/CopyField";
import { detectPlatform, downloadsFor, installCommand } from "@/common/utils/platform.js";

export const EmptyState = () => {
    const [platform, setPlatform] = useState({ os: null, arch: null });
    const [open, setOpen] = useState(false);
    const downloads = downloadsFor(platform);
    const [primary, ...rest] = downloads.files;

    useEffect(() => {
        detectPlatform().then(setPlatform);
    }, []);

    return (
        <div className="empty">
            <div className="empty-head">
                <Waypoints size={22} />
                <h2>No tunnels yet</h2>
                <p>Tunnels show up here the moment the CLI shares something.</p>
                <button type="button" className={`empty-toggle${open ? " open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
                    Getting started<ChevronDown />
                </button>
            </div>

            {open && <ol className="empty-steps">
                <li>
                    <h3>Get the CLI</h3>
                    <p>One line, picks the right build for this machine.</p>
                    <CopyField value={installCommand(platform.os)} />
                    {primary && <a className="empty-download" href={primary.url}>
                        <Download />
                        <span>{primary.label}</span>
                    </a>}
                    <div className="empty-platforms">
                        {rest.map(entry => <a key={entry.url} href={entry.url}>{entry.label}</a>)}
                        <a href={downloads.all}>All releases</a>
                    </div>
                </li>
                <li>
                    <h3>Link this device</h3>
                    <p>Sends you back here to confirm, then the device stays signed in.</p>
                    <CopyField value="tunlit login" />
                </li>
                <li>
                    <h3>Share a port</h3>
                    <p>Swap 3000 for the port your app runs on, or share a folder with <code>tunlit serve .</code></p>
                    <CopyField value="tunlit http 3000" />
                </li>
            </ol>}
        </div>
    );
};
