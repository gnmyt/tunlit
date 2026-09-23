import "./styles.sass";
import { ArrowLeft } from "lucide-react";
import Button from "@/common/components/Button";
import TunlitLogo from "@/common/components/TunlitLogo";

export const NotFound = () => (
    <div className="not-found">
        <TunlitLogo size={36} />
        <h1>Nothing here.</h1>
        <p>That page does not exist, or it moved somewhere else.</p>
        <Button text="Back to the start" icon={ArrowLeft} to="/" type="secondary" />
    </div>
);
