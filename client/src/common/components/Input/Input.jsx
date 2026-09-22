import "./styles.sass";

export const Input = ({ type = "text", id, name, placeholder, value, setValue, onChange, onKeyDown,
                          autoComplete, autoFocus, required, disabled, label, suffix, inputMode }) => {
    const handleChange = event => {
        if (setValue) setValue(event.target.value);
        if (onChange) onChange(event);
    };

    return (
        <div className="field">
            {label && <label htmlFor={id}>{label}</label>}
            <div className="field-input">
                <input type={type} id={id} name={name} placeholder={placeholder} value={value} onChange={handleChange}
                       onKeyDown={onKeyDown} autoComplete={autoComplete} autoFocus={autoFocus} required={required}
                       disabled={disabled} inputMode={inputMode} />
                {suffix && <span className="field-suffix">{suffix}</span>}
            </div>
        </div>
    );
};
