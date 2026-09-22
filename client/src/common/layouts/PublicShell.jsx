import { useState } from "react";
import { AsideContext } from "./aside.js";
import TunlitLogo from "@/common/components/TunlitLogo";
import "./public.sass";

export const PublicShell = ({ children }) => {
    const [aside, setAside] = useState(null);

    return (
        <AsideContext.Provider value={setAside}>
            <div className="split">
                <div className="split-form">
                    <div className="split-form-inner">{children}</div>
                </div>
                <aside className={`split-hero${aside ? " filled" : ""}`}>
                    {aside || <>
                        <TunlitLogo size={40} className="split-hero-logo" />
                        <h2>One port.<br />Every tunnel.</h2>
                    </>}
                </aside>
            </div>
        </AsideContext.Provider>
    );
};

export default PublicShell;
