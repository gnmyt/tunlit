import "./styles.sass";
import Input from "@/common/components/Input";
import { FIELDS } from "./limits.js";

export const QuotaFields = ({ values, setValues, idPrefix, placeholders }) => (
    <div className="quota-fields">
        {FIELDS.map(({ key, label, suffix }) => (
            <Input key={key} id={`${idPrefix}-${key}`} type="number" inputMode="decimal" label={label} suffix={suffix}
                   placeholder={placeholders ? placeholders[key] : "0"}
                   value={values[key]} setValue={value => setValues({ ...values, [key]: value })} />
        ))}
    </div>
);
