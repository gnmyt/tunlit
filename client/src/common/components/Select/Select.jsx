import "./styles.sass";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export const Select = ({ options, selected, setSelected, label, id, disabled }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const current = options.find(option => option.value === selected);

    useEffect(() => {
        if (!open) return;
        const handleClick = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
        const handleKey = event => { if (event.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    return (
        <div className="field">
            {label && <label htmlFor={id}>{label}</label>}
            <div className={`select${open ? " open" : ""}`} ref={ref}>
                <button type="button" id={id} className="select-trigger" disabled={disabled} onClick={() => setOpen(!open)}>
                    <span>{current?.label || "Select"}</span>
                    <ChevronDown />
                </button>
                {open && (
                    <div className="select-menu" role="listbox">
                        {options.map(option => (
                            <button type="button" key={option.value} role="option" aria-selected={option.value === selected}
                                    className={`select-option${option.value === selected ? " selected" : ""}`}
                                    onClick={() => { setSelected(option.value); setOpen(false); }}>
                                <span>{option.label}</span>
                                {option.value === selected && <Check />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
