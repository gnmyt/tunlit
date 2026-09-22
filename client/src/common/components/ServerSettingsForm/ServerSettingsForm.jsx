import "./styles.sass";
import Input from "@/common/components/Input";
import Select from "@/common/components/Select";

export const ServerSettingsForm = ({ values, setValues, idPrefix = "settings", showHttpMode = true }) => {
    const update = (key, value) => setValues({ ...values, [key]: value });

    return (
        <div className="settings-form">
            <Input id={`${idPrefix}-baseDomain`} label="Base domain" placeholder="tunlit.example.com"
                   value={values.baseDomain} setValue={value => update("baseDomain", value)} autoComplete="off" />
            <Input id={`${idPrefix}-publicUrl`} label="Public URL" placeholder={`https://${values.baseDomain || "tunlit.example.com"}`}
                   value={values.publicUrl} setValue={value => update("publicUrl", value)} autoComplete="off" />
            {showHttpMode && (
                <Select id={`${idPrefix}-httpMode`} label="Forwarding mode" selected={values.httpMode}
                        setSelected={value => update("httpMode", value)}
                        options={[{ value: "subdomain", label: "Subdomain" }, { value: "path", label: "Path" }]} />
            )}
            <div className="settings-form-row">
                <Input id={`${idPrefix}-gracePeriod`} type="number" label="Grace period" suffix="sec"
                       value={values.gracePeriod} setValue={value => update("gracePeriod", value)} />
            </div>
        </div>
    );
};
