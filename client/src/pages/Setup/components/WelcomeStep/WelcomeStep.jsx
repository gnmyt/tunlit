import Button from "@/common/components/Button";
import { Server, ShieldCheck, Waypoints } from "lucide-react";

export const WelcomeStep = ({ onNext }) => {
    return (
        <>
            <div className="form-head">
                <h1>Welcome.</h1>
                <p>Three things and your tunnel server is ready.</p>
            </div>
            <ul className="setup-list">
                <li><ShieldCheck />Admin account</li>
                <li><Waypoints />Forwarding mode</li>
                <li><Server />Server settings</li>
            </ul>
            <div className="form-actions">
                <div className="spacer" />
                <Button text="Get started" onClick={onNext} />
            </div>
        </>
    );
};
