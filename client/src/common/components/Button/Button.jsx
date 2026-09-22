import "./styles.sass";

export const Button = ({ onClick, text, icon: Glyph, disabled, type = "primary", buttonType, title }) => {
    return (
        <button className={`btn btn-${type}${!text ? " btn-icon" : ""}`} onClick={onClick} disabled={disabled}
                type={buttonType} title={title} aria-label={title}>
            {Glyph && <Glyph />}
            {text && <span>{text}</span>}
        </button>
    );
};
