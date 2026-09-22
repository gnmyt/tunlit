import "./styles.sass";
import { Download, Waypoints } from "lucide-react";
import CopyField from "@/common/components/CopyField";
import { DOWNLOADS, RELEASES_URL, detectPlatform } from "./downloads.js";

export const EmptyState = () => {
    const detected = detectPlatform();
    const primary = DOWNLOADS.find(entry => entry.key === detected);
    const rest = DOWNLOADS.filter(entry => entry !== primary);

    return (
        <div className="empty">
            <div className="empty-head">
                <Waypoints size={22} />
                <h2>No tunnels yet</h2>
                <p>Tunnels show up here the moment the CLI shares something. Three steps to the first one.</p>
            </div>

            <ol className="empty-steps">
                <li>
                    <h3>Get the CLI</h3>
                    <p>A single binary with nothing to install around it.</p>
                    {primary && <a className="empty-download" href={primary.url}>
                        <Download />
                        <span>Download for {primary.title}</span>
                    </a>}
                    <div className="empty-platforms">
                        {rest.map(entry => <a key={entry.key} href={entry.url}>{entry.title}</a>)}
                        <a href={RELEASES_URL}>All releases</a>
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
            </ol>
        </div>
    );
};
