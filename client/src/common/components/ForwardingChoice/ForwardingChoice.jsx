import { ModeDiagram } from "./ModeDiagram.jsx";
import { MODES } from "./modes.js";

export const ForwardingChoice = ({ value, onChange, onPreview }) => (
    <div className="mode-choices" onMouseLeave={() => onPreview?.(null)}>
        {Object.entries(MODES).map(([mode, details]) => (
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

export const ForwardingExplainer = ({ mode, domain }) => (
    <div className="mode-explainer">
        <ModeDiagram mode={mode} domain={domain} />
        <h3>{MODES[mode].title}</h3>
        <ul>{MODES[mode].facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
    </div>
);
