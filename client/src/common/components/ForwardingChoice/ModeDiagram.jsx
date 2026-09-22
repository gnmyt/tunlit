const LAYOUT = {
    url: { x: 0.5, width: 237 },
    gutter: 34,
    port: { width: 72 },
    row: { height: 34, gap: 12, top: 20 },
    label: { baseline: 8, size: 8.5 },
    padding: 13,
};

const PORT_X = LAYOUT.url.x + LAYOUT.url.width + LAYOUT.gutter;
const WIDTH = PORT_X + LAYOUT.port.width + 0.5;
const HEIGHT = LAYOUT.row.top + LAYOUT.row.height * 2 + LAYOUT.row.gap + 2;
const ARROW = LAYOUT.url.x + LAYOUT.url.width + LAYOUT.gutter / 2;
const TEXT_BASELINE = LAYOUT.row.top + LAYOUT.row.height / 2 + 4.5;

const ROWS = [
    { id: "app", port: ":3000", offset: 0 },
    { id: "docs", port: ":8080", offset: LAYOUT.row.height + LAYOUT.row.gap },
];

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const ModeDiagram = ({ mode, domain }) => {
    const isSubdomain = mode === "subdomain";
    const host = domain.length > 24 ? `${domain.slice(0, 23)}…` : domain;

    return (
        <svg className="mode-diagram" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
             aria-label={isSubdomain
                 ? `Each tunnel gets its own hostname in front of ${domain}`
                 : `Each tunnel gets a path under ${domain}`}>
            <text x={LAYOUT.url.x} y={LAYOUT.label.baseline} fontSize={LAYOUT.label.size}
                  fill="var(--muted)" letterSpacing="0.09em">PUBLIC URL</text>
            <text x={PORT_X} y={LAYOUT.label.baseline} fontSize={LAYOUT.label.size}
                  fill="var(--muted)" letterSpacing="0.09em">LOCAL PORT</text>

            {ROWS.map(row => (
                <g key={row.id} transform={`translate(0 ${row.offset})`}>
                    <rect x={LAYOUT.url.x} y={LAYOUT.row.top} width={LAYOUT.url.width} height={LAYOUT.row.height}
                          rx="9" fill="var(--surface-raised)" stroke="var(--border-strong)" />
                    <text x={LAYOUT.url.x + LAYOUT.padding} y={TEXT_BASELINE} fontSize="11.5" fontFamily={MONO}>
                        {isSubdomain ? <>
                            <tspan fill="var(--primary-bright)">{row.id}.</tspan>
                            <tspan fill="var(--subtext)">{host}</tspan>
                        </> : <>
                            <tspan fill="var(--subtext)">{host}</tspan>
                            <tspan fill="var(--primary-bright)">/@{row.id}</tspan>
                        </>}
                    </text>

                    <path d={`M${ARROW - 11} ${TEXT_BASELINE - 4.5} h22 m-4.5 -4.5 l4.5 4.5 -4.5 4.5`}
                          fill="none" stroke="var(--border-strong)" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round" />

                    <rect x={PORT_X} y={LAYOUT.row.top} width={LAYOUT.port.width} height={LAYOUT.row.height}
                          rx="9" fill="var(--surface-raised)" stroke="var(--border)" />
                    <text x={PORT_X + LAYOUT.port.width / 2} y={TEXT_BASELINE} fontSize="11.5" textAnchor="middle"
                          fill="var(--text)" fontFamily={MONO}>{row.port}</text>
                </g>
            ))}
        </svg>
    );
};
