export const MODES = {
    subdomain: {
        title: "Subdomain",
        summary: "Every tunnel gets its own hostname.",
        facts: [
            "The tunnel id becomes a label in front of your base domain.",
            "Needs a wildcard DNS record and a wildcard certificate.",
            "Each tunnel is its own origin, so cookies and storage stay separate.",
        ],
    },
    path: {
        title: "Path",
        summary: "Every tunnel lives under one hostname.",
        facts: [
            "The tunnel id becomes a path segment after your base domain.",
            "Works with a single DNS record and an ordinary certificate.",
            "All tunnels share one origin; each browser tab is bound to its own.",
        ],
    },
};
