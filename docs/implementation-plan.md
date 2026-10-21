# Flowboard implementation roadmap

Status: Day 1–2 implemented; Day 3 administration/move code added and static builds pass. Runtime verification, the deferred second-channel proof, pagination/boundary follow-up, and Day 4 executable tests remain pending. Updated 2026-10-21.

This is the delivery order, not a second copy of the module specifications. Start with the [documentation hub](README.md). Each [module guide](README.md) owns its behavior/schema/interfaces/examples/test TODOs. [Architecture](architecture.md) owns allowed dependencies, [API/contracts](modules/api-contracts.md) owns HTTP conventions, and the [derived ER](er-diagram.md) assembles the 16 owned tables. The [old monolithic plan](archive/2026-10-20-monolithic-plan.md) is historical only.

## 1. Agreed target

Build the assignment's single-workspace Flowboard with React/AntD, NestJS, PostgreSQL/Prisma, Nx/Yarn Workspaces, and three Compose services. Include real seeded-user local login with Flowboard JWTs, sessions, refresh rotation, and logout. Preserve the [original auth reference](references/auth-identity-er.png) and [common sign-in flow](references/shared-sign-in-flow.png).

Credentials belong to users. Local and future SSO converge before shared Flowboard session/token creation; actual SSO remains future scope. Session revoked_at controls refresh-family revocation. The identity guide is authoritative for these details.

Target four focused days, approximately 32 hours. This is an estimate, not a guarantee. Real authentication tightens the budget; reduce visual polish before required correctness/tests. Do not add stretch work while mandatory requirements remain incomplete. See [requirements and scope](requirements.md).

## 2. Build phases

| Phase          | Bounded work                                                                                                                                            | Exit condition                                                                                                                                                          | Module references                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day 1, 8 hours | Review documentation/ADRs; Nx/Yarn/boundaries; Compose/migrations/seed; local and shared auth lifecycle; initial hierarchy.                             | Docker starts, identity tables match reference, login/refresh/revocation work, seeded tree exists.                                                                      | [Runtime](modules/persistence-runtime.md), [identity](modules/identity.md), [hierarchy](modules/hierarchy.md)                                                                                                                           |
| Day 2, 8 hours | Resolver models, backend permissions, tasks/answers/moves/order; shared HTTP contracts, Work overview, and initial AntD shell/task views.               | APIs validate effective config/access and UI can create/edit/view tasks through the same channel-neutral routes; shared/auth/UI-only channel boundaries are documented. | [Permissions](modules/permissions.md), [statuses](modules/statuses.md), [fields](modules/custom-fields.md), [tasks](modules/tasks.md), [workflows](modules/workflows.md), [API](modules/api-contracts.md), [web](modules/web-client.md) |
| Day 3, 8 hours | Finish move corrections; container/status/field/grant screens; feedback and docs. The user deferred the second-channel cookbook and Swagger completion. | Admin and task journeys have code and static checks; runtime review must confirm inherited/local configuration, grants, and safety blockers before feature freeze.      | [Web](modules/web-client.md), [API](modules/api-contracts.md), all domain guides                                                                                                                                                        |
| Day 4, 8 hours | Implement recorded required cases, fix defects, clean Docker verification, final docs/AI log, 4-6 minute demo.                                          | Required tests/checks pass; submission reproducible.                                                                                                                    | [Test plan](test-plan.md), [requirements](requirements.md), [runtime](modules/persistence-runtime.md)                                                                                                                                   |

During Days 1-3, record test cases as TODOs and run documentation/type/lint/boundary/build/manual checks. Do not generate executable application test cases or empty passing suites before feature freeze. App-test implementation occurs on Day 4.

## 3. Phase-by-phase proof

1. Foundation: sign in as Alice/Bob; inspect a correctly scoped seeded tree; confirm no mock-header fallback.
2. Domain: Backlog and Delivery resolve different columns; edit a typed custom answer; reject invalid values and unsafe moves with no partial changes.
3. Product: configure statuses at space/list levels and fields at container level; demonstrate grant differences and actionable safety blockers.
4. Stabilization: execute real PostgreSQL backend and browser tests through Docker; verify restart/seed persistence and token revocation.
5. Delivery: show the running app and explain boundaries, ER decisions, trade-offs, AI corrections, and the future SSO/IPC design without claiming future features are implemented.

## 4. Reviewer run and final checklist

```bash
docker compose up --build
```

The supported path requires Docker only. UI is on 8080, API on 3000; the base Compose file keeps the database internal. Exact defaults/seed/signing/production safeguards are in [runtime](modules/persistence-runtime.md). The Docker application source exists; the `make test` target and executable application tests remain Day 4 work.

| Deliverable    | Completion evidence                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product        | Hierarchy/tasks/inheritance/fields/permissions/board/table/detail/config forms and specified seed data operate.                                                         |
| Authentication | User-owned credentials, matching session identities, shared token service, refresh/replay/logout work.                                                                  |
| Checks         | Actual required tests, module boundaries, types, lint, build, and documentation checks pass.                                                                            |
| Documentation  | README run/ports/accounts/API/architecture/data model/auth/channel/scale/IPC/trade-offs; AI_USAGE.md with useful corrections/rejections. Module specs match final code. |
| Submission     | Git source, Compose/.env.example/migrations, and 4-6 minute demo: startup, login, navigation, different sibling columns, custom answer edit, Alice/Bob difference.      |

## 5. Future changes

Use the [change guide](change-guide.md). Update the owning module and applicable ADR/contracts/code/TODOs together, then regenerate/check the ER. Do not put new business rules only into this roadmap. SSO, webhooks, workers, search, live updates, secondary task memberships, and cross-parent container moves require separately scoped work.

Next scheduled phase: complete Day 3 runtime review, then address the separately identified pagination and Nx module-boundary gaps. Those gaps do not block Day 3 admin workflows, but should be resolved before final verification. Day 4 implements/runs the recorded tests after feature freeze.

### Deferred second-channel work

The user explicitly deferred the second channel from Day 3. Before final submission, schedule a short HTTP-client proof if the assignment still requires it:

1. Complete Swagger request/response DTO and Bearer/cookie security metadata against the live route catalog.
2. Write a real-login curl cookbook that keeps the refresh cookie in a jar, sends the configured allowed Origin on cookie-sensitive auth calls, and uses the returned access JWT for tree, board, task edit, refresh, and logout.
3. Run the cookbook against the same `/v1` server and seeded workspace as the web UI, and record matching authorization, validation, error envelopes, and task results.
4. If a CLI is desired later, make it a thin HTTP adapter over those calls and shared contracts. Keep authentication/session issuance and business workflows in the existing API; no new domain tables or separate task rules are needed.

Incoming/outgoing webhooks and IPC still require their separately documented sender/identity or event-delivery design. This roadmap change does not claim they are implemented.
