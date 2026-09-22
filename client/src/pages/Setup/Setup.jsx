import "./styles.sass";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Loading from "@/common/components/Loading";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/toast.js";
import { useUser } from "@/common/contexts/user.js";
import { normalizeSettings } from "@/common/components/ServerSettingsForm";
import WelcomeStep from "./components/WelcomeStep";
import AccountStep from "./components/AccountStep";
import ForwardingStep from "./components/ForwardingStep";
import HttpsStep from "./components/HttpsStep";
import ServerStep from "./components/ServerStep";
import DoneStep from "./components/DoneStep";

const STEPS = ["Welcome", "Account", "Forwarding", "HTTPS", "Server", "Done"];
const LAST_EDITABLE = 4;

export const Setup = () => {
    const { sendToast } = useToast();
    const { setupRequired, setSetupRequired, login } = useUser();
    const navigate = useNavigate();
    const [settings, setSettings] = useState(null);
    const [step, setStep] = useState(0);
    const [account, setAccount] = useState({ username: "", password: "", confirm: "" });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        getRequest("setup/status")
            .then(data => setSettings(data.settings))
            .catch(error => sendToast("Error", error.message));
    }, [sendToast]);

    if (!setupRequired) return <Navigate to="/tunnels" replace />;
    if (!settings) return <Loading />;

    const complete = async () => {
        setSubmitting(true);
        try {
            await postRequest("setup/complete", {
                username: account.username,
                password: account.password,
                settings: normalizeSettings(settings),
            });
            await login();
            setStep(5);
        } catch (error) {
            sendToast("Error", error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const finish = () => {
        setSetupRequired(false);
        navigate("/tunnels", { replace: true });
    };

    return (
        <div className="setup">
            <div className="setup-rail">
                {STEPS.map((title, index) => (
                    <button type="button" key={title} aria-label={title} aria-current={index === step}
                            className={`setup-rail-dot${index === step ? " active" : ""}${index < step ? " done" : ""}`}
                            disabled={index >= Math.min(step, LAST_EDITABLE)}
                            onClick={() => setStep(index)} />
                ))}
            </div>

            {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
            {step === 1 && <AccountStep account={account} setAccount={setAccount} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
            {step === 2 && <ForwardingStep settings={settings} setSettings={setSettings} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
            {step === 3 && <HttpsStep settings={settings} setSettings={setSettings} onBack={() => setStep(2)} onNext={() => setStep(4)} />}
            {step === 4 && <ServerStep settings={settings} setSettings={setSettings} onBack={() => setStep(3)} onNext={complete} submitting={submitting} />}
            {step === 5 && <DoneStep username={account.username} onFinish={finish} />}
        </div>
    );
};
