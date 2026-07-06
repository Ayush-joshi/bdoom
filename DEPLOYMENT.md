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
git clone git@github.com:<OWNER>/bdoom.git /opt/bdoom/repo
cd /opt/bdoom/repo
npm install
```

## Configure Environment

```bash
cp .env.example /opt/bdoom/.env
nano /opt/bdoom/.env
```

Set production values, generate a strong `SESSION_SECRET`, and keep secrets out of Git. Do not commit `.env` and do not overwrite an existing `/opt/bdoom/.env`.

## Seed Accounts

```bash
npm run seed:admin -- --username <admin_username> --password '<strong_password>'
npm run seed:brother -- --username brother --password '<strong_password>'
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
sudo systemctl enable bdoom-api
sudo systemctl restart bdoom-api
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

## GitHub Actions Deployment

The repository includes `.github/workflows/deploy.yml`. It deploys every push to
`main` on the self-hosted GitHub Actions runner installed on the OCI VM:

```bash
cd /opt/bdoom/repo
git pull --ff-only
./deploy/deploy.sh
```

The runner is expected to run on Linux ARM64 as `ubuntu`. Because it runs on the
VM itself, GitHub does not need SSH access to the VM for deployments.
