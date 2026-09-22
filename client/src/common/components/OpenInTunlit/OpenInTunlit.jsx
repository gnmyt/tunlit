import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import { Download, Terminal } from "lucide-react";
import Button from "@/common/components/Button";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { detectPlatform, downloadsFor } from "@/common/utils/platform.js";

const HANDOFF_TIMEOUT = 1500;

export const OpenInTunlit = ({ code, server = window.location.origin }) => {
    const [downloads, setDownloads] = useState(null);
    const timers = useRef([]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const offerDownload = async () => {
        const [platform, info] = await Promise.all([detectPlatform(), getRequest("info").catch(() => ({}))]);
        setDownloads(downloadsFor(platform, info.version));
    };

    const open = () => {
        setDownloads(null);
        window.location.href = `tunlit://connect/${encodeURIComponent(code)}?server=${encodeURIComponent(server)}`;

        timers.current.push(setTimeout(() => {
            if (document.hasFocus()) offerDownload();
        }, HANDOFF_TIMEOUT));
    };

    return (
        <div className="open-in-tunlit">
            <Button icon={Terminal} text="Open in tunlit" type="secondary" onClick={open} />

            {downloads && (
                <div className="open-in-tunlit-download">
                    <p>tunlit does not seem to be installed here.</p>
                    <div className="open-in-tunlit-files">
                        {downloads.files.map(file => (
                            <a key={file.url} href={file.url} download>
                                <Download size={14} />
                                {file.label}
                            </a>
                        ))}
                    </div>
                    <a className="open-in-tunlit-all" href={downloads.all} target="_blank" rel="noreferrer noopener">
                        {downloads.version ? `All builds of ${downloads.version}` : "All builds"}
                    </a>
                </div>
            )}
        </div>
    );
};
