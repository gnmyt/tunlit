import { defineConfig } from "vitepress";

export default defineConfig({
    title: "tunlit",
    description: "Self-hosted tunnels: subdomain, path and direct TCP/UDP behind one public port",
    lastUpdated: true,
    cleanUrls: true,
    metaChunk: true,

    head: [
        ["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
        ["meta", { name: "theme-color", content: "#0D9488" }],
        ["meta", { property: "og:type", content: "website" }],
        ["meta", { property: "og:locale", content: "en" }],
        ["meta", { property: "og:title", content: "tunlit | Self-hosted tunnels behind one public port" }],
        ["meta", { property: "og:site_name", content: "tunlit" }],
        ["meta", { property: "og:image", content: "/logo.png" }],
        ["meta", { property: "og:image:type", content: "image/png" }],
        ["meta", { property: "twitter:card", content: "summary" }],
        ["meta", { property: "og:url", content: "https://docs.tunlit.dev" }],
    ],
    themeConfig: {
        logo: "/logo.svg",

        nav: [
            { text: "Home", link: "/" },
            { text: "Install", link: "/installation" },
            { text: "CLI", link: "/cli" },
        ],

        footer: {
            message: "Distributed under the MIT License",
            copyright: "© 2026 Mathias Wagner",
        },
        search: {
            provider: "local",
        },

        sidebar: [
            {
                text: "Documentation",
                items: [
                    { text: "Home", link: "/" },
                    { text: "Introduction", link: "/introduction" },
                    { text: "Install", link: "/installation" },
                    { text: "Configuration", link: "/configuration" },
                    { text: "HTTPS", link: "/https" },
                    { text: "Reverse Proxy", link: "/reverse-proxy" },
                    { text: "CLI", link: "/cli" },
                ],
            },
        ],

        socialLinks: [
            { icon: "github", link: "https://github.com/gnmyt/tunlit" },
            { icon: "discord", link: "https://dc.gnmyt.dev" },
        ],
    },
});
