import "./styles.sass";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Input from "@/common/components/Input";
import Button from "@/common/components/Button";
import { useUser } from "@/common/contexts/user.js";
import { resetWorkers } from "@/common/utils/tunnelTab.js";

export const Select = () => {
    const { user } = useUser();
    const navigate = useNavigate();
    const [id, setId] = useState("");

    const open = async event => {
        event.preventDefault();
        const name = id.trim().toLowerCase().replace(/^@/, "");
        if (!name) return;
        await resetWorkers();
        window.location.href = `/@${encodeURIComponent(name)}`;
    };

    return (
        <form className="select-page" onSubmit={open}>
            <div className="form-head">
                <h1>No tunnel selected.</h1>
                <p>Enter a tunnel id to open it in this browser.</p>
            </div>
            <div className="form-body">
                <Input id="tunnel-id" label="Tunnel id" placeholder="k3x9ab" value={id} setValue={setId} autoFocus />
            </div>
            <div className="form-actions">
                <Button type="ghost" text={user ? "Dashboard" : "Admin login"} buttonType="button"
                        onClick={() => navigate(user ? "/tunnels" : "/login")} />
                <div className="spacer" />
                <Button text="Open" buttonType="submit" disabled={!id.trim()} />
            </div>
        </form>
    );
};
