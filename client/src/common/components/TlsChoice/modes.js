export const TLS_MODES = {
    proxy: {
        title: "Behind a proxy",
        summary: "nginx or Caddy terminates TLS and forwards to tunlit.",
        facts: [
            "tunlit serves plain HTTP on one port and never sees a certificate.",
            "Your proxy already holds the wildcard certificate and renews it.",
            "Trust the X-Forwarded-* headers so tunnels see the real visitor.",
        ],
    },
    acme: {
        title: "tunlit manages it",
        summary: "tunlit gets certificates from Let's Encrypt and serves HTTPS.",
        facts: [
            "Listens on 443 for traffic and on 80 to send visitors to HTTPS.",
            "Renews on its own, thirty days before a certificate runs out.",
            "Nothing else needs to run in front of it.",
        ],
    },
};
