---
layout: home

hero:
  name: tunlit
  text: Self-hosted tunnels
  tagline: Expose local ports through your own server - subdomain, path or direct TCP/UDP, all behind one public port
  actions:
    - theme: brand
      text: Install
      link: /installation
    - theme: alt
      text: Introduction
      link: /introduction
    - theme: alt
      text: GitHub
      link: https://github.com/gnmyt/tunlit
  image:
    src: /logo.png
    alt: tunlit

features:
  - icon: 🌐
    title: Subdomain tunnels
    details: tunlit http 3000 gives your local app its own https://<id>.your-domain, with WebSockets and rewritten redirects. tunlit http . shares a folder.
    link: /introduction
    linkText: Learn more
  - icon: 🍪
    title: Path mode
    details: No wildcard certificate? Set httpMode to path and tunnels live under https://your-domain/@<id>, one per browser tab.
    link: /introduction
    linkText: Learn more
  - icon: 🔌
    title: Direct TCP + UDP
    details: tunlit tcp 25565 prints a share code. Others run tunlit connect and get the port on their own machine, TCP and UDP.
    link: /introduction
    linkText: Learn more
  - icon: 🔁
    title: Reconnects
    details: Lost your connection? The CLI reconnects with the same URL or share code inside the grace period.
  - icon: 📱
    title: QR & clipboard
    details: Every URL and share code is printed as a terminal QR code and copied to your clipboard.
  - icon: 🪶
    title: Tiny footprint
    details: A small Node.js server, a single static Rust binary, one YAML file and one SQLite file.
---

<style>
:root {
  --vp-home-hero-name-color: #0D9488;
  --vp-home-hero-image-background-image: linear-gradient(rgba(13,148,136,0.25), rgba(13,148,136,0.25));
  --vp-home-hero-image-filter: blur(100px);
}
</style>
