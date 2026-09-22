import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

export const QrCode = ({ value, size = 148 }) => {
    const [src, setSrc] = useState(null);

    useEffect(() => {
        toDataURL(value, { width: size * 2, margin: 1, color: { dark: "#FAFAF9", light: "#00000000" } })
            .then(setSrc)
            .catch(() => setSrc(null));
    }, [value, size]);

    if (!src) return <div className="qr-code" style={{ width: size, height: size }} />;
    return <img className="qr-code" src={src} width={size} height={size} alt="" />;
};
