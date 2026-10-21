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

## 2026-10-21 — Web component boundaries

- Split the four substantial admin editors out of `admin-panel.tsx` into focused component files, keeping the panel responsible for choosing the owner and tab. Clarified in the web guide that one function per file is not a universal React rule; cohesion and ownership guide file boundaries.
- Wrapped the React root in `StrictMode` to surface unsafe effect/render assumptions during development. Updated the web sequence diagram with inline component responsibility notes.
- Grouped dashboard UI files by feature under `dashboard/admin`, `dashboard/tasks`, and `dashboard/home`; updated imports and the module guide without changing component logic.

## 2026-10-21 — Authentication resilience correction

- Review found refresh-token replay revocation was updated and then rolled back because the code threw inside the Prisma transaction. Changed the transaction to return a replay outcome, commit the session revocation, then return HTTP 401.
- Replaced the browser `fetch` wrapper with Axios interceptors per the user's direction. The interceptor refreshes protected 401s through the existing refresh route, serializes refresh with an in-tab promise and Web Locks, retries each original request once, and signs out on refresh failure. Login/refresh are excluded; protected logout requests can refresh before retrying. Tokens remain in memory and are not broadcast between tabs.

## 2026-10-21 — Workspace scope and hierarchy constraints

- Corrected the Day 1 database gap where single-column foreign keys allowed cross-workspace references and non-list task placement. Added composite workspace/type keys, strict hierarchy and task-list checks, and a migration that stops on inconsistent existing rows instead of silently changing relationships.
- Kept effective status, inherited custom-field, access, and archive checks in their owning workflows. Prisma required the optional one-to-one status-set owner to use a composite unique key; updated the schema and migration together.

## 2026-10-21 — API startup correction

- Corrected the Docker startup path after verification found that unconditional demo seeding stopped non-demo API startup. The startup script now applies migrations on every launch, runs the idempotent seed only when `FLOWBOARD_DEMO_MODE=true`, and then starts the API.

## 2026-10-21 — Day 3 administration and configuration

- Added admin-only container, grant, status-set, and custom-field workflows through the existing owner services and shared workspace transaction. Reused the retained-task query for status/field safety, including archived tasks, instead of validating only visible board rows.
- Added the web admin panel and cross-list move corrections. Failed candidate saves preserve the draft; the server remains authoritative for permissions and effective configuration.
- Corrected a local Prisma generation issue during static verification: the checked-in schema had a new `parent_type` relation key while the installed generated client was stale. Regenerated from the repository schema using a writable temporary Prisma engine cache; no schema decision changed.
- Deferred the second-channel cookbook/Swagger completion at the user's request and documented its remaining proof steps. No executable application tests were added for Day 3; new edge cases are TODO rows for Day 4.
- Ran a disposable Docker/PostgreSQL manual API smoke check: Alice admin writes, Bob denial/member write rejection, 409 blockers for unsafe status reset and required field creation, strict container creation, local field creation, and inherited status preview. Removed the isolated containers and volumes afterward. This is not executable test coverage or a complete browser review.

## 2026-10-21 — Day 3 browser runtime correction

- Browser and HTTP review exposed HTTP 500 on task edit, corrected move, and task creation. The error was a Prisma client validation failure in nested assignment/answer writes. Replaced the nested writes with ordered task, assignment, and answer operations inside the existing workflow transaction; browser edit/move/create and archived configuration safety probes passed afterward.
- A direct Prisma diagnostic write was rejected by automatic approval review because it would delete and recreate task values just to reproduce the error. Continued with the authorized browser/API journeys, read-only source inspection, and isolated runtime checks instead.
- Recorded the manual pass, controlled concurrency and inactive-membership probes, and remaining Day 4 executable-test cases in [the runtime review](docs/day3-runtime-review.md). No passing application test suite was invented.

## 2026-10-21 — Account header correction

- User browser feedback identified that the role-only header and exposed Sign out button did not identify the signed-in person. Replaced them with an initial avatar and account menu backed by the safe `/v1/me` projection. The local email is shown only when the user's login identifier is email-form; otherwise the menu says it is unavailable.

## 2026-10-21 — Admin usability corrections

- Browser feedback showed that raw status keys/categories, hidden hierarchy creation paths, bare field ordering controls, grant choices containing an admin, move warnings, and uncolored priority chips were unclear. Clarified the domain language, exposed all valid hierarchy creation levels, used drag ordering and compact move guidance, and applied a fixed priority palette in the web UI.
- A status-flow preview uses current draft order only. The existing model has no transition restrictions, so the preview explicitly says its arrows are sequence, not allowed-transition rules. Estimated about 2 hours for this scoped preview; a true transition editor would need a separate 1–2 day domain/ADR change.
- Enforced member-only grant targets inside the existing admin workflow. The `/v1/users` projection now includes role so the picker can exclude admins; the backend rejects forged admin targets independently of UI filtering. Day 4 executable coverage remains a TODO.

## 2026-10-21 — Hierarchy creation policy correction

- User review pointed out that the assignment defines the container hierarchy but does not require admin-only creation. The earlier admin-only rule was our documented MVP choice, not an assignment constraint. Revised ADR-0002 and the module guides: active members can create spaces, and folders/lists under accessible parents; admin-only controls still cover edits, archive, reorder, configuration, and grants.
- A private member-created container receives a creator allow grant in the same workspace transaction. This avoids creating a private node that immediately disappears from the creator's tree. Day 4 tests now include accessible/denied parents and atomic container-plus-grant behavior.

## 2026-10-21 — Creator sharing and private-parent clarity

- User browser feedback exposed a gap in the member creation policy: creators of private containers could not share them. Added an immutable creator reference to new containers and let the exact-container creator manage direct grants while their full ancestor path remains accessible. Admin grant authority remains unchanged. Existing rows are not assigned a creator from an allow grant alone; Bob's one local Private Space was repaired using its verified ID and matching self-allow.
- Clarified that “public” on a child means open to people who can access its parent. A public folder cannot expose a private space. Creator allow writes reject recipients blocked by a private/denied parent, and the UI explains that sharing a parent opens descendants unless denied. Updated ADR-0002 because the assignment did not define creator sharing or the ancestor/public intersection.
- Browser review found that the first API projection omitted `createdByUserId` from `/v1/tree`, leaving the new sharing control hidden despite stored creator data. Added it to the filtered tree projection, rebuilt, and confirmed both the Create-page and list-board Manage access controls. The disposable API and browser checks covered creator grant, blocked parent, self-grant protection, unrelated member denial, and admin access. Day 4 executable coverage remains TODO.
