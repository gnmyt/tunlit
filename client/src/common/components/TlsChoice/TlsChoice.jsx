import { TlsDiagram } from "./TlsDiagram.jsx";
import { TLS_MODES } from "./modes.js";

export const TlsChoice = ({ value, onChange, onPreview }) => (
    <div className="mode-choices" onMouseLeave={() => onPreview?.(null)}>
        {Object.entries(TLS_MODES).map(([mode, details]) => (
            <button type="button" key={mode} aria-pressed={value === mode}
                    className={`mode-choice${value === mode ? " selected" : ""}`}
                    onMouseEnter={() => onPreview?.(mode)}
                    onFocus={() => onPreview?.(mode)}
                    onClick={() => onChange(mode)}>
                <span className="mode-choice-title">
                    {details.title}
                    <span className="mode-choice-mark" aria-hidden="true" />
                </span>
                <span className="mode-choice-summary">{details.summary}</span>
            </button>
        ))}
    </div>
);

export const TlsExplainer = ({ mode }) => (
    <div className="mode-explainer">
        <TlsDiagram mode={mode} />
        <h3>{TLS_MODES[mode].title}</h3>
        <ul>{TLS_MODES[mode].facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
    </div>
);
