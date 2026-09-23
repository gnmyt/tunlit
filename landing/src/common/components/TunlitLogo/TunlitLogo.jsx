import { memo } from "react";

export const TunlitLogo = memo(({ size = 40, className = "" }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ overflow: "visible" }}
        >
            <defs>
                <filter id="glow_tunlit" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <g filter="url(#glow_tunlit)">
                <path d="M96 366V226A160 160 0 0 1 416 226V366" stroke="var(--primary)" strokeWidth="62" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M196 374V226A60 60 0 0 1 316 226V374" stroke="var(--primary)" strokeOpacity="0.45" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M150 446H362" stroke="var(--primary)" strokeWidth="62" strokeLinecap="round" strokeLinejoin="round" />
            </g>
        </svg>
    );
});

TunlitLogo.displayName = "TunlitLogo";
