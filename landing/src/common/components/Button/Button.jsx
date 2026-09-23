import "./styles.sass";
import { Link } from "react-router-dom";

export const Button = ({ text, icon: Glyph, to, href, type = "primary", size = "md" }) => {
    const className = `btn btn-${type} btn-${size}`;
    const content = <>{Glyph && <Glyph />}<span>{text}</span></>;

    if (to) return <Link to={to} className={className}>{content}</Link>;
    return <a href={href} className={className} target="_blank" rel="noreferrer">{content}</a>;
};
