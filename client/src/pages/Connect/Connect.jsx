import "./styles.sass";
import { useParams } from "react-router-dom";
import CopyField from "@/common/components/CopyField";
import OpenInTunlit from "@/common/components/OpenInTunlit";

export const Connect = () => {
    const { code } = useParams();
    const command = `tunlit connect ${window.location.origin}/@tunlit/connect/${code}`;

    return (
        <div className="connect-page">
            <div className="form-head">
                <h1>Connect to this port.</h1>
                <p>The port appears on your own machine, as if it were running there.</p>
            </div>

            <OpenInTunlit code={code} />

            <div className="connect-command">
                <span>or run</span>
                <CopyField value={command} />
            </div>

            <p className="connect-hint">
                No tunlit yet? <a href="https://docs.tunlit.dev/installation" target="_blank" rel="noreferrer noopener">Install it</a> in one line.
                You do not need an account to connect.
            </p>
        </div>
    );
};
