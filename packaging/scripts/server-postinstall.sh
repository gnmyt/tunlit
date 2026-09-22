#!/bin/sh
set -e

if ! getent group tunlit >/dev/null 2>&1; then
    groupadd --system tunlit
fi
if ! getent passwd tunlit >/dev/null 2>&1; then
    useradd --system --gid tunlit --home-dir /var/lib/tunlit-server \
        --shell /usr/sbin/nologin --comment "tunlit" tunlit
fi

mkdir -p /var/lib/tunlit-server
chown -R tunlit:tunlit /var/lib/tunlit-server
chmod 0750 /var/lib/tunlit-server

mkdir -p /etc/tunlit-server
chown root:tunlit /etc/tunlit-server
chmod 0750 /etc/tunlit-server
if [ -f /etc/tunlit-server/server.env ]; then
    chown root:tunlit /etc/tunlit-server/server.env
    chmod 0640 /etc/tunlit-server/server.env
fi

if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload || true
    systemctl enable tunlit-server.service || true
fi

exit 0
