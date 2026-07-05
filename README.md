# BDoom Gateway

BDoom is a secure personal gateway intended to run on an Oracle OCI Free Ubuntu VM at `https://bdoom.duckdns.org`.

Phase 1 includes an Angular dashboard, a NestJS backend, SQLite persistence, Argon2id password hashing, and server-side sessions stored in Secure HttpOnly cookies. The backend is the source of truth for authentication and role checks.

## Current Features

- Login and logout using backend-managed sessions.
- Admin and brother roles.
- Admin dashboard links for Files, Remote, AI, Status, and Admin.
- Brother dashboard access to Files only.
- Protected backend endpoints under `/api`.
- SQLite users and sessions tables.
- Seed scripts for admin and brother accounts.
- Caddy and systemd deployment templates.

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

For local development, set `COOKIE_SECURE=false` in `.env` unless you are serving over HTTPS.

Seed users:

```bash
npm run seed:admin -- --username admin --password 'change-me'
npm run seed:brother -- --username brother --password 'change-me-too'
```

Run the API:

```bash
npm run dev:api
```

Run the web app:

```bash
npm run dev:web
```

The Angular dev server proxies `/api` to `http://127.0.0.1:3000`.

## Project Structure

```text
apps/web        Angular frontend
apps/api        NestJS backend
deploy          Caddy, systemd, and deploy script
docs            Architecture notes
```

## Security Model

BDoom uses server-side sessions, not localStorage JWTs. Passwords are hashed with Argon2id. Session tokens are generated with cryptographically secure randomness, stored only as SHA-256 hashes in SQLite, and sent to the browser using an HttpOnly cookie.

Angular route checks exist only for user experience. Every protected API route validates the session on the backend, and admin-only routes enforce the admin role on the backend.
