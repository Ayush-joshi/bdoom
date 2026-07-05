# BDoom Architecture

BDoom Phase 1 runs the public gateway on the OCI VM:

- Caddy terminates HTTPS and serves the Angular app.
- Caddy reverse proxies `/api/*` to NestJS on `127.0.0.1:3000`.
- NestJS enforces authentication and authorization.
- SQLite stores users and server-side sessions under `/opt/bdoom/data`.

The browser receives only a session cookie. The raw session token is never stored in the database; only a SHA-256 hash is persisted.

## Roles

- `admin`: full dashboard access to Files, Remote, AI, Status, and Admin.
- `brother`: files-only dashboard access.

Frontend routing is convenience UX. The backend remains the security boundary for protected routes and role checks.

## Future Home Integration

A home Ubuntu PC will later connect to OCI through WireGuard. The `/files` and `/remote` areas are placeholders for private backend integrations over that tunnel.

- `/files`: brother-accessible private file access.
- `/remote`: admin-only remote desktop, expected to use MeshCentral later.
