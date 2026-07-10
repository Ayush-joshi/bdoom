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
- IPTV channel browsing with direct and server-compatible playback modes.
- An authenticated world radio map at `/radio` with nearby station discovery and direct browser playback.

## World Radio Map

The IP Radio feature uses MapLibre GL JS with OpenFreeMap tiles and a bounded, browser-session cache of geographically tagged stations from the public Radio Browser API. Click the map, choose a radius, select a nearby station, and control playback from the persistent player.

Map and radio endpoints are public configuration rather than secrets. They are centralized in `apps/web/src/environments/environment.ts`:

- `mapStyleUrl` controls the MapLibre style URL.
- `radioBrowserServers` contains ordered API fallbacks.
- `radioStationFetchLimit` limits the cached station collection to protect browser performance.

No OCI or Caddy changes are required. Radio streams play directly in the browser; HLS streams use native support or the existing on-demand hls.js loader.

Known limitations:

- Public station records can become stale or go offline.
- HTTP-only streams may be blocked by browser mixed-content rules on the HTTPS production site.
- Stations can apply geographic restrictions.
- Direct playback depends on browser support for the station codec and stream format.
- The MVP searches a bounded global station sample; a future backend geospatial index can improve coverage.

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
npm run seed:admin -- --username <admin_username> --password '<strong_local_password>'
npm run seed:brother -- --username brother --password '<strong_local_password>'
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

Run all checks and create production bundles:

```bash
npm run lint
npm run test
npm run build
```

## Project Structure

```text
apps/web        Angular frontend
  src/app/features/radio  World radio map feature
apps/api        NestJS backend
deploy          Caddy, systemd, and deploy script
docs            Architecture notes
```

## Security Model

BDoom uses server-side sessions, not localStorage JWTs. Passwords are hashed with Argon2id. Session tokens are generated with cryptographically secure randomness, stored only as SHA-256 hashes in SQLite, and sent to the browser using an HttpOnly cookie.

Angular route checks exist only for user experience. Every protected API route validates the session on the backend, and admin-only routes enforce the admin role on the backend.
