# Assignment requirements and ownership

Navigation: [hub](README.md), [roadmap](implementation-plan.md), [test plan](test-plan.md).

The supplied 11-page take-home PDF defines required behavior. Source page numbers below refer to that document, not new requirements invented by implementation. Local password/JWT/refresh authentication is an explicitly chosen addition replacing the assignment's permitted mock identity. All module specifications are currently planned, not implemented.

## 1. Required product surface

| ID | Requirement and source pages | Owning guide | Acceptance references |
| --- | --- | --- | --- |
| REQ-HIER | Strict workspace/space/folder/list/tasks, container CRUD/order/archive; pp. 4-5 | [Hierarchy](modules/hierarchy.md) | HIER-01 through HIER-08 |
| REQ-TASK | Task CRUD, fields, assignments, due date, one list, moves/status/order; pp. 4-5 | [Tasks](modules/tasks.md), [workflows](modules/workflows.md) | TASK-01 through TASK-10; FLOW-02 through FLOW-04 |
| REQ-STATUS | Ancestor-scoped sets, local overrides, required categories, CRUD/order/preview, sibling differences; pp. 5-6, 11 | [Statuses](modules/statuses.md) | STATUS-01 through STATUS-10 |
| REQ-FIELD | Six types, definition/value split, required/options/inheritance, config safety; pp. 6-7, 11 | [Custom fields](modules/custom-fields.md) | FIELD-01 through FIELD-10 |
| REQ-VIEW | Sidebar, board, table, detail, two field columns, due-date/priority sort, basic config UI; pp. 7-8 | [Web](modules/web-client.md) | WEB-01, WEB-05 through WEB-10 |
| REQ-PERM | Alice/Bob/Carol, grants/public/private, filtered tree/direct access/config permissions; p. 8 | [Permissions](modules/permissions.md) | PERM-01 through PERM-10 |

## 2. Engineering and delivery

| ID | Requirement and source pages | Owning guide | Acceptance references |
| --- | --- | --- | --- |
| REQ-DESIGN | Architecture, trust boundaries, board/drag flow, config location; p. 2 | [Architecture](architecture.md), [workflows](modules/workflows.md) | FLOW-01, FLOW-06, FLOW-08 |
| REQ-API | Versioned standardized API, errors, pagination, Swagger/table; p. 2 | [API/contracts](modules/api-contracts.md) | API-01 through API-08 |
| REQ-AUTH | Real authentication boundary, backend-resolved role, 401/403, production extension; p. 2 | [Identity](modules/identity.md) | AUTH-01 through AUTH-15 |
| REQ-CHANNEL | Web plus light second channel sharing domain/auth; pp. 2-3 | [API/cookbook](modules/api-contracts.md) | API-01, API-06, API-07 |
| REQ-SCALE | Boundaries, stateless API, indexes, extraction and IPC failure story; p. 3 | [Architecture](architecture.md), [runtime](modules/persistence-runtime.md) | RUN-04 through RUN-08; ADR review |
| REQ-DOCKER | One-command Docker-only run, env example, bootstrap/seed; pp. 3, 10-11 | [Runtime](modules/persistence-runtime.md) | RUN-01 through RUN-03, RUN-07, RUN-09 |
| REQ-SEED | Workspace/tree/users/grants/statuses/fields/20+ tasks/migrations; p. 8 | [Runtime](modules/persistence-runtime.md) | RUN-01, RUN-02, FIELD-01, STATUS-03 |
| REQ-TEST | Named backend edge cases, frontend edit journey, Docker/make test; pp. 8-9 | [Test plan](test-plan.md) | All module TODO groups; WEB-01/WEB-02 |
| REQ-DOC | Run, design, model, API, auth/channel, scale/IPC, trade-offs/AI log; p. 9 | [Hub](README.md), [roadmap](implementation-plan.md) | Documentation gate |
| REQ-SUBMIT | Git source, Compose/env, README, 4-6 minute demo; p. 10 | [Roadmap](implementation-plan.md) | Final submission checklist |

## 3. User-selected additions and defaults

| ID | Decision | Specification |
| --- | --- | --- |
| USER-AUTH | User-owned credentials, Flowboard JWTs, sessions, rotating refresh, future common SSO flow | [Identity](modules/identity.md), [ADR-0004](adr/0004-authentication.md) |
| USER-STACK | React/AntD, NestJS, Nx/Yarn, PostgreSQL | [Architecture](architecture.md), [ADR-0001](adr/0001-modular-monolith.md) |
| USER-DOCS | Module documents as the source of truth, plain language, examples and diagrams | [Hub](README.md), [change guide](change-guide.md) |
| USER-TEST | Record scenarios first; implement after feature freeze | [Test plan](test-plan.md), [ADR-0005](adr/0005-delivery-and-consistency.md) |
| USER-SAFETY | Complete replacement status sets, additive fields, ancestor-aware access, reject unsafe changes | [ADR-0002](adr/0002-hierarchy-and-access.md), [ADR-0003](adr/0003-scoped-configuration.md) |

## 4. Boundaries and deferred work

Single workspace/tenant; seeded users; no signup, billing, email, uploads, or mobile-first requirement. React and Node satisfy the allowed frontend/backend choices. Workspace is the fixed seeded root; space/folder/list CRUD provides the mutable container hierarchy.

No stretch feature is scheduled. The assignment permits at most two after the required MVP is solid. Search, custom filters, optimistic conflict UI, activity/async worker, bulk changes, live updates, generated clients, hosted deployment, and one-level subtasks remain future work. An SSO adapter is designed/test-doubled, not a claimed implemented provider.

## 5. How to use this page

Before shipping, check every REQ row against its owner, code, verification, and README. Update an implementation status only when evidence exists. A documentation diagram or a TODO does not satisfy a runtime/test requirement. If a selected addition endangers the time budget, record the trade-off explicitly rather than silently dropping required tests or scoped configuration behavior.
