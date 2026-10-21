# Flowboard

Flowboard has a Dockerized Day 1 foundation and working Day 2 Work overview and permission-filtered list/task views. React/Ant Design calls the same NestJS `/v1` API that a curl client can use. PostgreSQL/Prisma provides the schema and idempotent demo seed; local passwords use Flowboard sessions and rotating refresh tokens.

## Run locally with Docker

```bash
docker compose up --build
```

Open `http://localhost:8080`. The API is also directly available at `http://localhost:3000` (including Swagger at `/docs`); the database intentionally has no host port.

## Quality checks

```bash
yarn lint
yarn typecheck
yarn format:check
```

Use `yarn lint:fix` to apply safe ESLint fixes and `yarn format:write` to format the workspace with Prettier.

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

## Implemented API surface

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/auth/logout-all`
- `GET /v1/me`
- `GET /v1/users`, `GET /v1/tree`, `GET /v1/workspaces/:id/overview` (permission-filtered)
- `GET /v1/lists/:id/board`, `/tasks`, `/resolved-statuses`, `/resolved-fields`
- `POST /v1/lists/:id/tasks`; `GET/PATCH/DELETE /v1/tasks/:id`
- `POST /v1/tasks/:id/placement`, `/move`

Day 2 opens a live Work overview after login, with visible task/list counts and upcoming due dates. The sidebar opens permission-filtered list boards, task APIs, Board and Table views, and task editing. Board cards open a wide modal; Table rows open a right-side drawer. Container/status/field/grant administration and the polished cross-list move UI remain scheduled for Day 3. See [docs/implementation-plan.md](docs/implementation-plan.md).
