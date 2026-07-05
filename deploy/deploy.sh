#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="/opt/bdoom/app"
DATA_DIR="/opt/bdoom/data"
WEB_DIR="/var/www/bdoom"

cd "$ROOT_DIR"

echo "Installing dependencies..."
npm install

echo "Building BDoom..."
npm run build

echo "Creating deployment directories..."
sudo mkdir -p "$APP_DIR" "$DATA_DIR" "$WEB_DIR"
sudo chown -R ubuntu:ubuntu /opt/bdoom

echo "Publishing Angular app..."
sudo rsync -a --delete apps/web/dist/bdoom-web/ "$WEB_DIR/"

echo "Publishing API..."
rsync -a --delete \
  --exclude node_modules \
  --exclude src \
  --exclude test \
  apps/api/ "$APP_DIR/apps/api/"
cp package.json package-lock.json "$APP_DIR/"

if [[ ! -f /opt/bdoom/.env ]]; then
  echo "/opt/bdoom/.env does not exist. Create it from .env.example before starting the service."
fi

echo "Next manual commands:"
echo "  sudo cp deploy/bdoom-api.service /etc/systemd/system/bdoom-api.service"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now bdoom-api"
echo "  sudo cp deploy/Caddyfile /etc/caddy/Caddyfile"
echo "  sudo caddy validate --config /etc/caddy/Caddyfile"
echo "  sudo systemctl reload caddy"
