# Assignment requirements and ownership

Navigation: [hub](README.md), [test plan](test-plan.md).

The [assignment requirements](flowboard-module.md) define required behavior. Section references below point to its headings, not new requirements invented by implementation. Local password/JWT/refresh authentication is an explicitly chosen addition replacing the assignment's permitted mock identity. Admin and move flows have code and manual runtime review; executable application tests remain TODOs.

## 1. Required product surface

| ID         | Requirement and source section                                                                         | Owning guide                                                 | Acceptance references                            |
| ---------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------ |
| REQ-HIER   | Strict workspace/space/folder/list/tasks, CRUD/order/archive; Must-have requirements §1                | [Hierarchy](modules/hierarchy.md)                            | HIER-01 through HIER-13                          |
| REQ-TASK   | Task CRUD, fields, assignments, moves/status/order; Must-have requirements §2                          | [Tasks](modules/tasks.md), [workflows](modules/workflows.md) | TASK-01 through TASK-11; FLOW-02 through FLOW-04 |
| REQ-STATUS | Scoped status sets, inheritance, CRUD/order/preview, sibling differences; Must-have requirements §3    | [Statuses](modules/statuses.md)                              | STATUS-01 through STATUS-13                      |
| REQ-FIELD  | Six field types, required/options/inheritance, validation and config safety; Must-have requirements §4 | [Custom fields](modules/custom-fields.md)                    | FIELD-01 through FIELD-14                        |
| REQ-VIEW   | Sidebar, board, table, detail, custom columns, sorting, config UI; Must-have requirements §5           | [Web](modules/web-client.md)                                 | WEB-01 through WEB-22                            |
| REQ-PERM   | Alice/Bob/Carol, grants, visibility, filtered tree and direct access; Must-have requirements §6        | [Permissions](modules/permissions.md)                        | PERM-01 through PERM-16                          |

## 2. Engineering and delivery

| ID          | Requirement and source section                                                                                                           | Owning guide                                                               | Acceptance references                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| REQ-DESIGN  | Architecture, trust boundaries, board/drag flow, config location; Engineering expectations §1                                            | [Architecture](architecture.md), [workflows](modules/workflows.md)         | FLOW-01, FLOW-06, FLOW-08             |
| REQ-API     | Versioned standardized API, errors, pagination, Swagger/table; Engineering expectations §2                                               | [API/contracts](modules/api-contracts.md)                                  | API-01 through API-12                 |
| REQ-AUTH    | Real auth boundary, server-resolved role, 401/403, production extension; Engineering expectations §3                                     | [Identity](modules/identity.md)                                            | AUTH-01 through AUTH-16               |
| REQ-CHANNEL | Web and curl share `/v1`, auth, contracts, and domain behavior; future CLI/webhooks are design placeholders; Engineering expectations §4 | [API/cookbook](modules/api-contracts.md), [architecture](architecture.md)  | API-01, API-06, API-07                |
| REQ-SCALE   | Boundaries, stateless API, indexes, extraction and IPC failure story; Engineering expectations §§5–6                                     | [Architecture](architecture.md), [runtime](modules/persistence-runtime.md) | RUN-04 through RUN-08; ADR review     |
| REQ-DOCKER  | One-command Docker run, env example, bootstrap/seed; Engineering expectations §7 and Deliverables                                        | [Runtime](modules/persistence-runtime.md)                                  | RUN-01 through RUN-03, RUN-07, RUN-09 |
| REQ-SEED    | Workspace/tree/users/grants/config/20+ tasks/migrations; Must-have requirements §7                                                       | [Runtime](modules/persistence-runtime.md)                                  | RUN-01, RUN-02, FIELD-01, STATUS-03   |
| REQ-TEST    | Named backend edge cases, frontend journey, Docker/make test; Must-have requirements §8                                                  | [Test plan](test-plan.md)                                                  | All module TODO groups; WEB-01/WEB-02 |
| REQ-DOC     | Run, design, model, API, auth/channel, scale/IPC, trade-offs/AI log; Must-have requirements §9                                           | [Hub](README.md)                                                           | Documentation gate                    |
| REQ-SUBMIT  | Git source, Compose/env, README, 4–6 minute demo; Deliverables                                                                           | [Project README](../README.md)                                             | Final submission checklist            |

## 3. User-selected additions and defaults

| ID          | Decision                                                                                                                                 | Specification                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| USER-AUTH   | User-owned credentials, Flowboard JWTs, sessions, rotating refresh, future common SSO flow                                               | [Identity](modules/identity.md), [ADR-0004](adr/0004-authentication.md)                    |
| USER-STACK  | React/AntD, NestJS, Nx/Yarn, PostgreSQL                                                                                                  | [Architecture](architecture.md), [ADR-0001](adr/0001-modular-monolith.md)                  |
| USER-DOCS   | Module documents as the source of truth, plain language, examples and diagrams                                                           | [Hub](README.md), [change guide](change-guide.md)                                          |
| USER-TEST   | Record scenarios first; implement after feature freeze                                                                                   | [Test plan](test-plan.md), [ADR-0005](adr/0005-delivery-and-consistency.md)                |
| USER-SAFETY | Complete replacement status sets, additive fields, ancestor-aware access, reject unsafe changes                                          | [ADR-0002](adr/0002-hierarchy-and-access.md), [ADR-0003](adr/0003-scoped-configuration.md) |
| USER-HOME   | Work overview replaces Backlog as the post-login landing; show live permission-filtered counts, accessible lists, and upcoming due dates | [Web](modules/web-client.md), [API](modules/api-contracts.md)                              |
| USER-DEMO   | Optional Render/Neon demo; release creation is inert and a manual GitHub workflow selects release and service(s) | [Deployment](deployment.md), [ADR-0005](adr/0005-delivery-and-consistency.md) |

## 4. Boundaries and deferred work

Single workspace/tenant; seeded users; no signup, billing, email, uploads, or mobile-first requirement. React and Node satisfy the allowed frontend/backend choices. Workspace is the fixed seeded root; space/folder/list CRUD provides the mutable container hierarchy.

No stretch feature is scheduled. The assignment permits at most two after the required MVP is solid. The user has selected a short-lived hosted demo as delivery support; it is not a production deployment claim. Search, custom filters, optimistic conflict UI, activity/async worker, bulk changes, live updates, generated clients, production hosting, webhooks, a thin CLI, and one-level subtasks remain future work. An SSO adapter is designed/test-doubled, not a claimed implemented provider.

## 5. How to use this page

Before shipping, check every REQ row against its owner, code, verification, and README. Update an implementation status only when evidence exists. A documentation diagram or a TODO does not satisfy a runtime/test requirement. If a selected addition endangers the time budget, record the trade-off explicitly rather than silently dropping required tests or scoped configuration behavior.
