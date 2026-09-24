import "@/pages/Connect/styles.sass";
import { useParams } from "react-router-dom";
import CopyField from "@/common/components/CopyField";
import OpenInTunlit from "@/common/components/OpenInTunlit";

export const Invite = () => {
    const { token } = useParams();
    const origin = window.location.origin;
    const link = `${origin}/@tunlit/invite/${token}`;

    return (
        <div className="connect-page">
            <div className="form-head">
                <h1>Tunnel through this server.</h1>
                <p>This link lets you open tunnels here without an account. Keep it to yourself.</p>
            </div>

            <OpenInTunlit href={`tunlit://invite/${encodeURIComponent(token)}?server=${encodeURIComponent(origin)}`} />

            <div className="connect-command">
                <span>or run</span>
                <CopyField value={`tunlit login ${link}`} />
            </div>

            <p className="connect-hint">
                No tunlit yet? <a href="https://docs.tunlit.dev/installation" target="_blank" rel="noreferrer noopener">Install it</a> in one line.
                Afterwards <code>tunlit http 3000</code> works as usual.
            </p>
        </div>
    );
};
