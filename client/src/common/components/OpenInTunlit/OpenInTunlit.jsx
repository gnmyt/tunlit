import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import { Download, Terminal } from "lucide-react";
import Button from "@/common/components/Button";
import CopyField from "@/common/components/CopyField";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { detectPlatform, downloadsFor, installCommand } from "@/common/utils/platform.js";

const HANDOFF_TIMEOUT = 1500;

export const OpenInTunlit = ({ href }) => {
    const [missing, setMissing] = useState(null);
    const timers = useRef([]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const offerInstall = async () => {
        const [platform, info] = await Promise.all([detectPlatform(), getRequest("info").catch(() => ({}))]);
        setMissing({ command: installCommand(platform.os), downloads: downloadsFor(platform, info.version) });
    };

    const open = () => {
        setMissing(null);
        window.location.href = href;

        timers.current.push(setTimeout(() => {
            if (document.hasFocus()) offerInstall();
        }, HANDOFF_TIMEOUT));
    };

    return (
        <div className="open-in-tunlit">
            <Button icon={Terminal} text="Open in tunlit" type="secondary" onClick={open} />

            {missing && (
                <div className="open-in-tunlit-install">
                    <p>tunlit does not seem to be installed here. Install it, then try again.</p>
                    <CopyField value={missing.command} />
                    <div className="open-in-tunlit-files">
                        {missing.downloads.files.map(file => (
                            <a key={file.url} href={file.url} download>
                                <Download size={14} />
                                {file.label}
                            </a>
                        ))}
                    </div>
                    <a className="open-in-tunlit-all" href={missing.downloads.all} target="_blank" rel="noreferrer noopener">
                        {missing.downloads.version ? `All builds of ${missing.downloads.version}` : "All builds"}
                    </a>
                </div>
            )}
        </div>
    );
};
