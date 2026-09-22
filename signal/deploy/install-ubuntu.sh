#!/usr/bin/env bash
# One-shot installer for a fresh Ubuntu/Debian VPS (run as root):
#   curl -fsSL https://raw.githubusercontent.com/kuzesociety/kuzesociety/claude/signal-meme-trading-bot-o142hw/signal/deploy/install-ubuntu.sh | bash
set -euo pipefail
BRANCH="${BRANCH:-claude/signal-meme-trading-bot-o142hw}"
apt-get update -y && apt-get install -y ca-certificates curl git
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
id signal >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin signal
mkdir -p /opt/signal
if [ ! -d /opt/signal/.git ]; then git clone --branch "$BRANCH" https://github.com/kuzesociety/kuzesociety /opt/signal; else git -C /opt/signal pull; fi
cd /opt/signal/signal
npm ci --no-audit --no-fund && npm run build
[ -f .env ] || { cp .env.example .env; sed -i "s/^DASHBOARD_TOKEN=.*/DASHBOARD_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')/" .env; }
chown -R signal:signal /opt/signal
cp deploy/signal.service /etc/systemd/system/signal.service
systemctl daemon-reload
systemctl enable --now signal
echo
echo "SIGNAL is running. Dashboard: http://$(curl -s ifconfig.me || echo YOUR_SERVER_IP):8787"
echo "Access token: $(grep ^DASHBOARD_TOKEN= .env | cut -d= -f2)"
echo "Edit /opt/signal/signal/.env (RPC key, Telegram) then: systemctl restart signal"
