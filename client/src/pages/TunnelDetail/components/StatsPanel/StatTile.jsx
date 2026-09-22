export const StatTile = ({ label, value, accent }) => (
    <div className={`stat-tile${accent ? ` accent-${accent}` : ""}`}>
        <span className="stat-tile-label">{label}</span>
        <span className="stat-tile-value">{value}</span>
    </div>
);
