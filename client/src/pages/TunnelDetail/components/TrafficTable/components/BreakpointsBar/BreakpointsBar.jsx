import "./styles.sass";
import { useState } from "react";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import Select from "@/common/components/Select";
import { putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { ArrowLeft, ArrowLeftRight, ArrowRight, Plus, X } from "lucide-react";

const METHODS = [["", "Any"], ["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["PATCH", "PATCH"], ["DELETE", "DELETE"]].map(([value, label]) => ({ value, label }));
const PHASES = [{ value: "request", label: "Request" }, { value: "response", label: "Response" }, { value: "both", label: "Both" }];
const PHASE_ICONS = { request: ArrowRight, response: ArrowLeft, both: ArrowLeftRight };

export const PhaseIcon = ({ phase }) => {
    const Glyph = PHASE_ICONS[phase];
    return <Glyph className="phase-icon" aria-label={phase} />;
};

export const BreakpointsBar = ({ tunnelId, rules, onChanged }) => {
    const { sendToast } = useToast();
    const [method, setMethod] = useState("");
    const [phase, setPhase] = useState("request");
    const [path, setPath] = useState("/");
    const [busy, setBusy] = useState(false);

    const save = async next => {
        setBusy(true);
        try {
            await putRequest(`tunnels/${tunnelId}/breakpoints`, { rules: next });
            onChanged();
            return true;
        } catch (error) {
            sendToast("Error", error.message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const add = async () => {
        if (await save([...rules, { method, path: path.trim(), phase }])) setPath("/");
    };

    return (
        <div className="breakpoints">
            <ul className="breakpoint-list">
                {rules.map((rule, index) => (
                    <li key={index}>
                        <PhaseIcon phase={rule.phase} />
                        <span className="breakpoint-method">{rule.method || "ANY"}</span>
                        <code>{rule.path}</code>
                        <button type="button" onClick={() => save(rules.filter((_, at) => at !== index))} disabled={busy} aria-label="Remove" title="Remove"><X /></button>
                    </li>
                ))}
                {rules.length === 0 && <li className="breakpoint-empty">No breakpoints. Matching requests wait until you continue or drop them.</li>}
            </ul>
            <div className="breakpoint-add">
                <Select id="breakpoint-method" options={METHODS} selected={method} setSelected={setMethod} />
                <Select id="breakpoint-phase" options={PHASES} selected={phase} setSelected={setPhase} />
                <Input id="breakpoint-path" value={path} setValue={setPath} placeholder="/api"
                       onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
                <Button type="ghost" icon={Plus} text="Add" buttonType="button" onClick={add} disabled={busy || !path.trim()} />
            </div>
        </div>
    );
};
