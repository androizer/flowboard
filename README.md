# Flowboard

Flowboard has a Dockerized modular monolith with Work overview, permission-filtered task views, and Day 3 administration routes and UI. React/Ant Design calls the NestJS `/v1` API; a second-channel curl proof is documented for later work. PostgreSQL/Prisma provides the schema and idempotent demo seed; local passwords use Flowboard sessions and rotating refresh tokens.

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

## Design and requirements

The complete assignment requirements are tracked in [docs/flowboard-module.md](docs/flowboard-module.md), with ownership and acceptance cases in [docs/requirements.md](docs/requirements.md). The [system architecture](docs/architecture.md) shows the trust boundaries, request flow, module dependencies, and location of status and custom-field resolution.

The data model has one workspace and a strict workspace → space → folder → list → tasks hierarchy. A list inherits the nearest complete status set; custom fields accumulate from space through list. The [ER reference](docs/er-diagram.md) is generated from the owning [module guides](docs/README.md), which document validation, archival, permissions, and safe configuration changes.

## API, authentication, and channels

The versioned REST API uses `/v1`, JSON error envelopes, paginated collections, and task versions. The route overview below and [API guide](docs/modules/api-contracts.md) match the implemented handlers. A Swagger shell is available at `/docs`; complete DTO/security metadata and the second-channel curl proof are deferred as shown in the [roadmap](docs/implementation-plan.md).

Users authenticate with local credentials and Flowboard access JWTs plus rotating refresh cookies. The API resolves the current membership and role; it does not trust request-body roles. Future SSO verifiers are designed to converge on the same Flowboard session service. See [identity and session decisions](docs/modules/identity.md) and [ADR-0004](docs/adr/0004-authentication.md).

## Scale, IPC, and trade-offs

The backend is a modular monolith with stateless API processes and PostgreSQL-backed sessions. Domain repositories stay within their owners; workflows coordinate cross-module changes transactionally. No worker or queue is included. The future activity/search path is an outbox and worker with idempotent consumers, retries, and eventual consistency; see [architecture](docs/architecture.md) and [ADR-0005](docs/adr/0005-delivery-and-consistency.md).

The MVP prioritizes scoped configuration, validation, permission enforcement, and atomic moves over stretch features such as search, live updates, and bulk edits. See the [roadmap](docs/implementation-plan.md) for planned work and delivery status. AI corrections and rejected output are recorded in [AI_USAGE.md](AI_USAGE.md).

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
- `GET/PATCH /v1/workspaces/:id`; `GET/POST /v1/containers`, `GET/PATCH/DELETE /v1/containers/:id`, `POST /v1/containers/reorder`
- `GET/PUT /v1/workspaces/:id/status-set`; `GET/PUT/DELETE /v1/containers/:id/status-set`
- `GET/POST /v1/containers/:id/fields`; `PATCH/DELETE /v1/fields/:id`; `POST /v1/containers/:id/fields/reorder`
- `GET /v1/containers/:id/grants`; `PUT/DELETE /v1/containers/:id/grants/:userId`

The web opens a live, permission-filtered Work overview after login. Board cards open a modal and Table rows open a drawer. Admins can manage hierarchy, scoped statuses, local fields, and grants; task details offer a destination-aware move dialog. Static builds and an isolated PostgreSQL API smoke check passed; complete browser review and Day 4 application tests remain pending. See [docs/implementation-plan.md](docs/implementation-plan.md).
