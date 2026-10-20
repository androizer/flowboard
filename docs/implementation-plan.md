# Flowboard implementation roadmap

Status: Day 1 foundation implemented; Days 2-4 remain planned. Updated 2026-10-20.

This is the delivery order, not a second copy of the module specifications. Start with the [documentation hub](README.md). Each [module guide](README.md) owns its behavior/schema/interfaces/examples/test TODOs. [Architecture](architecture.md) owns allowed dependencies, [API/contracts](modules/api-contracts.md) owns HTTP conventions, and the [derived ER](er-diagram.md) assembles the 16 owned tables. The [old monolithic plan](archive/2026-10-20-monolithic-plan.md) is historical only.

## 1. Agreed target

Build the assignment's single-workspace Flowboard with React/AntD, NestJS, PostgreSQL/Prisma, Nx/Yarn Workspaces, and three Compose services. Include real seeded-user local login with Flowboard JWTs, sessions, refresh rotation, and logout. Preserve the [original auth reference](references/auth-identity-er.png) and [common sign-in flow](references/shared-sign-in-flow.png).

Credentials belong to users. Local and future SSO converge before shared Flowboard session/token creation; actual SSO remains future scope. Session revoked_at controls refresh-family revocation. The identity guide is authoritative for these details.

Target four focused days, approximately 32 hours. This is an estimate, not a guarantee. Real authentication tightens the budget; reduce visual polish before required correctness/tests. Do not add stretch work while mandatory requirements remain incomplete. See [requirements and scope](requirements.md).

## 2. Build phases

| Phase | Bounded work | Exit condition | Module references |
| --- | --- | --- | --- |
| Day 1, 8 hours | Review documentation/ADRs; Nx/Yarn/boundaries; Compose/migrations/seed; local and shared auth lifecycle; initial hierarchy. | Docker starts, identity tables match reference, login/refresh/revocation work, seeded tree exists. | [Runtime](modules/persistence-runtime.md), [identity](modules/identity.md), [hierarchy](modules/hierarchy.md) |
| Day 2, 8 hours | Resolver models, backend permissions, tasks/answers/moves/order; initial AntD shell and task views. | APIs validate effective config/access and UI can create/edit/view tasks. | [Permissions](modules/permissions.md), [statuses](modules/statuses.md), [fields](modules/custom-fields.md), [tasks](modules/tasks.md), [workflows](modules/workflows.md), [web](modules/web-client.md) |
| Day 3, 8 hours | Finish board/table/drawer/move; container/status/field/grant screens; sorts/feedback; Swagger/cookbook/docs; freeze features. | Required product behavior complete; inherited/local configuration and failures understandable. | [Web](modules/web-client.md), [API](modules/api-contracts.md), all domain guides |
| Day 4, 8 hours | Implement recorded required cases, fix defects, clean Docker verification, final docs/AI log, 4-6 minute demo. | Required tests/checks pass; submission reproducible. | [Test plan](test-plan.md), [requirements](requirements.md), [runtime](modules/persistence-runtime.md) |

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

The supported path requires Docker only. UI is on 8080, API on 3000; database stays internal. Exact defaults/seed/signing/production safeguards are in [runtime](modules/persistence-runtime.md). Tests run through the future `make test` Docker target. All current runtime commands describe planned interfaces; there is no Compose/application source yet.

| Deliverable | Completion evidence |
| --- | --- |
| Product | Hierarchy/tasks/inheritance/fields/permissions/board/table/detail/config forms and specified seed data operate. |
| Authentication | User-owned credentials, matching session identities, shared token service, refresh/replay/logout work. |
| Checks | Actual required tests, module boundaries, types, lint, build, and documentation checks pass. |
| Documentation | README run/ports/accounts/API/architecture/data model/auth/channel/scale/IPC/trade-offs; AI_USAGE.md with useful corrections/rejections. Module specs match final code. |
| Submission | Git source, Compose/.env.example/migrations, and 4-6 minute demo: startup, login, navigation, different sibling columns, custom answer edit, Alice/Bob difference. |

## 5. Future changes

Use the [change guide](change-guide.md). Update the owning module and applicable ADR/contracts/code/TODOs together, then regenerate/check the ER. Do not put new business rules only into this roadmap. SSO, workers, search, live updates, secondary task memberships, and cross-parent container moves require separately scoped work.

Next action before application implementation: read the [architecture](architecture.md), [business walkthrough](business-walkthrough.md), and the Day 1 module guides; verify Docker with `docker info`.
