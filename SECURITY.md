# Security Policy

## Supported versions

Only the latest release gets security fixes. There are no long-term support branches.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
[GitHub's advisory form](https://github.com/gnmyt/tunlit/security/advisories/new) or by mail to
mathias@gnm.dev, and give it a few days for a first reply.

Helpful things to include: what an attacker gains, the forwarding mode the server runs in, and the
smallest set of steps that shows the problem.

## What tunlit assumes

A tunlit server is meant to sit behind a reverse proxy that terminates TLS. Two consequences:

- `trustProxy` decides whether `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` are
  believed. Turn it on only when nothing but your proxy can reach the port, because the per-tunnel
  IP allowlist and the login rate limit both rest on the client address.
- Everyone who can reach a tunnel's URL can reach whatever it forwards. Per-tunnel passwords and IP
  rules narrow that down; they do not replace authentication in the application behind the tunnel.
