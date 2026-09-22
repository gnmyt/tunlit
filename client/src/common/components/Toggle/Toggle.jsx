import "./styles.sass";

export const Toggle = ({ checked, onChange, id, disabled, label }) => {
    return (
        <div className="toggle-row">
            {label && <label htmlFor={id}>{label}</label>}
            <button type="button" id={id} role="switch" aria-checked={!!checked} disabled={disabled}
                    className={`toggle${checked ? " on" : ""}`} onClick={() => onChange(!checked)}>
                <span className="toggle-knob" />
            </button>
        </div>
    );
};
