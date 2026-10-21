# Flowboard

Day 1 foundation: React/Ant Design web shell, NestJS API, PostgreSQL/Prisma schema and idempotent demo seed, local password authentication, rotating refresh sessions, and an authenticated initial hierarchy endpoint.

## Run locally with Docker

```bash
docker compose up --build
```

Open `http://localhost:8080`. The API is also directly available at `http://localhost:3000` (including Swagger at `/docs`); the database intentionally has no host port.

Demo accounts use `FlowboardDemo!2026` by default: `alice@flowboard.com`, `bob@flowboard.com`, and `carol@flowboard.com`. These are development-only local credentials; the stable application user IDs remain independent of the eventual identity provider.

## Connect a local database client

The base Compose file intentionally keeps PostgreSQL off the host network. To use a local VS Code PostgreSQL extension, create an untracked `compose.override.yml` at the repository root. Docker Compose loads this file automatically when you run `docker compose up --build`.

```yaml
# compose.override.yml — local only; do not commit
services:
  db:
    networks:
      - internal
      - db-access
    ports:
      - '127.0.0.1:5433:5432'

networks:
  # Enables Docker Desktop port forwarding without adding the web service.
  db-access:
```

The file is listed in `.gitignore`, so each developer creates it locally. Connect the extension with:

```text
Host:     127.0.0.1
Port:     5433
Database: flowboard
User:     flowboard
Password: flowboard
SSL:      disabled
```

The host binding is loopback-only, so PostgreSQL is not exposed to the local network. If port 5433 is in use, choose another unused host port while keeping the container port as `5432`.

## Day 1 endpoints

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/auth/logout-all`
- `GET /v1/me`
- `GET /v1/tree`

The board, task, configuration, and complete permission workflows are scheduled for later phases. See [docs/implementation-plan.md](docs/implementation-plan.md).
