const BOX = { width: 92, height: 42, radius: 10 };
const GAP = 40;
const PAD = 4;
const WIDTH = BOX.width * 3 + GAP * 2 + PAD * 2;
const HEIGHT = BOX.height + PAD * 2;
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const CHAINS = {
    acme: [
        { label: "Visitor", port: "https" },
        { label: "tunlit", port: ":443", accent: true },
    ],
    proxy: [
        { label: "Visitor", port: "https" },
        { label: "nginx", port: ":443" },
        { label: "tunlit", port: ":8080", accent: true },
    ],
};

export const TlsDiagram = ({ mode }) => {
    const chain = CHAINS[mode] || CHAINS.proxy;
    const span = chain.length * BOX.width + (chain.length - 1) * GAP;
    const left = (WIDTH - span) / 2;

    return (
        <svg className="mode-diagram" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
             aria-label={mode === "acme"
                 ? "Visitors reach tunlit directly over HTTPS"
                 : "Visitors reach your proxy, which forwards to tunlit over plain HTTP"}>
            {chain.map((node, index) => {
                const x = left + index * (BOX.width + GAP);
                return (
                    <g key={node.label}>
                        <rect x={x} y={PAD} width={BOX.width} height={BOX.height} rx={BOX.radius}
                              fill="var(--surface-raised)"
                              stroke={node.accent ? "var(--primary)" : "var(--border-strong)"} />
                        <text x={x + BOX.width / 2} y={PAD + 18} fontSize="11" textAnchor="middle"
                              fill="var(--text)">{node.label}</text>
                        <text x={x + BOX.width / 2} y={PAD + 31} fontSize="10" textAnchor="middle" fontFamily={MONO}
                              fill={node.accent ? "var(--primary-bright)" : "var(--muted)"}>{node.port}</text>

                        {index < chain.length - 1 && (
                            <path d={`M${x + BOX.width + 8} ${PAD + BOX.height / 2} h${GAP - 16} m-5 -5 l5 5 -5 5`}
                                  fill="none" stroke="var(--border-strong)" strokeWidth="1.5"
                                  strokeLinecap="round" strokeLinejoin="round" />
                        )}
                    </g>
                );
            })}
        </svg>
    );
};
