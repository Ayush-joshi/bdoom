# BDoom Deployment

Target: Ubuntu 24.04 on Oracle OCI, serving `https://bdoom.duckdns.org`.

## Install Packages

```bash
sudo apt update
sudo apt install -y nodejs npm caddy git
```

Use a current Node.js LTS release. If Ubuntu's package is old, install Node from NodeSource or another trusted source.

## Clone Repository

```bash
sudo mkdir -p /opt/bdoom
sudo chown -R ubuntu:ubuntu /opt/bdoom
git clone <your-repo-url> /opt/bdoom/source
cd /opt/bdoom/source
npm install
```

## Configure Environment

```bash
cp .env.example /opt/bdoom/.env
nano /opt/bdoom/.env
```

Set production values and keep secrets out of Git. Do not commit `.env`.

## Seed Accounts

```bash
BDOOM_DB_PATH=/opt/bdoom/data/bdoom.sqlite npm run seed:admin -- --username <username> --password <password>
BDOOM_DB_PATH=/opt/bdoom/data/bdoom.sqlite npm run seed:brother -- --username <username> --password <password>
```

Use `--force` only when you intentionally want to replace an existing user's password hash and role.

## Deploy App

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

## Install Systemd Service

```bash
sudo cp deploy/bdoom-api.service /etc/systemd/system/bdoom-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now bdoom-api
sudo systemctl status bdoom-api
```

## Install Caddyfile

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Verify

```bash
curl -i https://bdoom.duckdns.org/api/health
```

Then visit `https://bdoom.duckdns.org` and sign in with a seeded account.
