# AI usage record

## 2026-10-20 — Day 1 implementation

- Created the initial monorepo, Docker topology, Prisma schema/migration, demo seed, web shell, and NestJS authentication/hierarchy foundation from the accepted module specifications.
- Corrected an initial Prisma schema draft that used semicolon-separated declarations; Prisma requires one definition per line.
- Preserved the accepted authentication design: credentials are user-owned, session revocation is held only on `AUTH_SESSIONS`, and refresh-token replay commits session revocation before returning 401.
- Deferred executable application tests until Day 4 as required by the roadmap. Type checks, builds, Prisma client generation, and documentation validation were run during Day 1.
- Changed clean-seed local login identifiers from short usernames to email-shaped identifiers. This preserves the accepted user-owned credential model and does not treat an email as a provider identity link.
- Corrected the initial USERS schema to include created_at and updated_at audit timestamps. The user requested that this belong in the initial migration rather than an incremental migration; the identity ER source and Prisma model were updated together.
- Clarified the future SSO migration: USER_CREDENTIALS can be retired without deleting USERS or AUTH_IDENTITIES, but the local email-shaped login identifier is otherwise lost. Add/backfill a user-owned primary_email as profile/migration data before credential retirement, while provider identities remain explicitly verified and linked by issuer/subject rather than email.

## 2026-10-21 — Day 2 implementation

- Corrected the Day 1 `GET /v1/tree` gap: its old handler returned every active container to members while the UI labeled the result server-filtered. Removed that handler and routed tree reads through ancestor-aware permissions; Bob and Carol now receive different trees and denied direct list/task reads return 403.
- Implemented task/status/field workflows behind the same `/v1` HTTP boundary for the web client and curl. Invalid custom values and incomplete cross-list move corrections are rejected without partial writes; task versions reject stale edits.
- Changed the first task-detail design after user feedback: Board cards open a wider modal, while Table rows open a right-side drawer. Backlog was the temporary landing until the user selected Work overview.
- Replaced that landing after the user selected the Work overview design. The first visual proposal had fixed seed counts; the implementation uses a permission-filtered, single-snapshot read contract so Alice, Bob, and Carol see their own live counts and due items.
- Kept incoming/outgoing webhooks as future channel designs. They require separate sender/event contracts and authentication; no webhook endpoint or worker was generated for Day 2.
- Deferred executable application tests per the chosen Day 4 schedule. Day 2 verification used type checks, builds, documentation validation, and manual API/browser checks against an isolated Docker stack.

## 2026-10-21 — Tooling integration

- Added Nx-inferred ESLint tasks and Prettier commands. Corrected the initial setup by aligning `@nx/eslint` and `@nx/eslint-plugin` to the lockfile-resolved Nx 20.8.4 version; the Nx documentation requires matching versions.

## 2026-10-21 — Authentication resilience correction

- Review found refresh-token replay revocation was updated and then rolled back because the code threw inside the Prisma transaction. Changed the transaction to return a replay outcome, commit the session revocation, then return HTTP 401.
- Replaced the browser `fetch` wrapper with Axios interceptors per the user's direction. The interceptor refreshes protected 401s through the existing refresh route, serializes refresh with an in-tab promise and Web Locks, retries each original request once, and signs out on refresh failure. Login/refresh are excluded; protected logout requests can refresh before retrying. Tokens remain in memory and are not broadcast between tabs.

## 2026-10-21 — Workspace scope and hierarchy constraints

- Corrected the Day 1 database gap where single-column foreign keys allowed cross-workspace references and non-list task placement. Added composite workspace/type keys, strict hierarchy and task-list checks, and a migration that stops on inconsistent existing rows instead of silently changing relationships.
- Kept effective status, inherited custom-field, access, and archive checks in their owning workflows. Prisma required the optional one-to-one status-set owner to use a composite unique key; updated the schema and migration together.

## 2026-10-21 — API startup correction

- Corrected the Docker startup path after verification found that unconditional demo seeding stopped non-demo API startup. The startup script now applies migrations on every launch, runs the idempotent seed only when `FLOWBOARD_DEMO_MODE=true`, and then starts the API.
