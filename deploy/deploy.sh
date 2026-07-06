#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="/opt/bdoom/app"
DATA_DIR="/opt/bdoom/data"
WEB_DIR="/var/www/bdoom"
SERVICE_FILE="/etc/systemd/system/bdoom-api.service"
CADDY_FILE="/etc/caddy/Caddyfile"

cd "$ROOT_DIR"

echo "Installing dependencies..."
npm install

echo "Building BDoom..."
npm run build

echo "Creating deployment directories..."
sudo mkdir -p "$APP_DIR" "$DATA_DIR" "$WEB_DIR"
sudo chown -R ubuntu:ubuntu /opt/bdoom "$WEB_DIR"

echo "Publishing Angular app..."
WEB_SEARCH_DIRS=()
if [[ -d apps/web/dist ]]; then
  WEB_SEARCH_DIRS+=(apps/web/dist)
fi
if [[ -d dist ]]; then
  WEB_SEARCH_DIRS+=(dist)
fi
if [[ ${#WEB_SEARCH_DIRS[@]} -eq 0 ]]; then
  echo "Could not find Angular dist directory." >&2
  exit 1
fi
WEB_INDEX="$(find "${WEB_SEARCH_DIRS[@]}" -path '*/index.html' -print | head -n 1)"
WEB_BUILD_DIR="$(dirname "${WEB_INDEX:-.}")"
if [[ -z "$WEB_BUILD_DIR" || ! -f "$WEB_BUILD_DIR/index.html" ]]; then
  echo "Could not find Angular index.html under apps/web/dist or dist." >&2
  exit 1
fi
rsync -a --delete "$WEB_BUILD_DIR"/ "$WEB_DIR"/
test -f "$WEB_DIR/index.html"

echo "Publishing API..."
rm -rf "$APP_DIR/dist" "$APP_DIR/node_modules" "$APP_DIR/package.json" "$APP_DIR/package-lock.json"
cp -R apps/api/dist "$APP_DIR/dist"
cp apps/api/package.json "$APP_DIR/package.json"
(
  cd "$APP_DIR"
  npm install --omit=dev
)

if [[ ! -f /opt/bdoom/.env ]]; then
  echo "/opt/bdoom/.env does not exist. Create it from .env.example before starting the service." >&2
  exit 1
fi

echo "Installing systemd service..."
if [[ -f "$SERVICE_FILE" ]]; then
  sudo cp "$SERVICE_FILE" "$SERVICE_FILE.bak.$(date +%Y%m%d%H%M%S)"
fi
sudo cp deploy/bdoom-api.service "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable bdoom-api
sudo systemctl restart bdoom-api

echo "Installing Caddy config..."
CADDY_BACKUP=""
if [[ -f "$CADDY_FILE" ]]; then
  CADDY_BACKUP="$CADDY_FILE.bak.$(date +%Y%m%d%H%M%S)"
  sudo cp "$CADDY_FILE" "$CADDY_BACKUP"
fi
sudo cp deploy/Caddyfile "$CADDY_FILE"
if ! sudo caddy validate --config "$CADDY_FILE"; then
  if [[ -n "$CADDY_BACKUP" ]]; then
    sudo cp "$CADDY_BACKUP" "$CADDY_FILE"
  fi
  echo "Caddy validation failed. Restored the previous Caddyfile." >&2
  exit 1
fi
sudo systemctl reload caddy

echo "Deployment complete."
