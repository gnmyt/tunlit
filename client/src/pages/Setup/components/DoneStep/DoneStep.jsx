import Button from "@/common/components/Button";
import { Check } from "lucide-react";

export const DoneStep = ({ username, onFinish }) => {
    return (
        <>
            <div className="setup-done">
                <div className="setup-done-icon"><Check /></div>
                <div className="form-head">
                    <h1>All set, {username}.</h1>
                    <p>Your tunnels show up on the dashboard. Run <code>tunlit login</code> on a machine to link it.</p>
                </div>
            </div>
            <div className="form-actions">
                <div className="spacer" />
                <Button text="Open dashboard" onClick={onFinish} />
            </div>
        </>
    );
};
