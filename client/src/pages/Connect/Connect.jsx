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
                No tunlit yet? Grab the CLI from the <a href="https://github.com/gnmyt/tunlit/releases"
                   target="_blank" rel="noreferrer noopener">releases page</a>. You do not need an account to connect.
            </p>
        </div>
    );
};
