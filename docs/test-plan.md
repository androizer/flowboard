# Deferred application test plan

Status: executable application tests remain TODO only. Manual runtime review does not replace them. Navigation: [hub](README.md), [requirements](requirements.md).

## 1. Timing and meaning

During Days 1-3, maintain scenarios and use manual smoke checks, documentation checks, types, lint, boundaries, and builds. After Day 3 feature freeze, implement the required backend/frontend tests. Do not create empty passing suites or report TODOs as coverage.

Each module owns its detailed scenario rows. This page indexes them without duplicating their expected behavior. When rules change, update the owner scenarios and this index only if the group changes.

The current backlog has 139 scenario rows, not a requirement for 139 separate test files. Parameterized tests and shared fixtures can cover related rows. Preserve the observable outcomes instead of mirroring internal implementation details.

## 2. Scenario owners

| Group                       | Owner and setup/action/outcome details    | Priority                                                         |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| AUTH-01 through AUTH-15     | [Identity](modules/identity.md)           | Required: login/session/rotation/revocation/reference invariants |
| HIER-01 through HIER-13     | [Hierarchy](modules/hierarchy.md)         | Required: tree/type/scope/archive/order/member creation          |
| PERM-01 through PERM-16     | [Permissions](modules/permissions.md)     | Required: role/grant/tree/direct URL consistency                 |
| STATUS-01 through STATUS-13 | [Statuses](modules/statuses.md)           | Required: inheritance/sibling columns/config safety              |
| FIELD-01 through FIELD-14   | [Custom fields](modules/custom-fields.md) | Required: six types/required/options/migration safety            |
| TASK-01 through TASK-11     | [Tasks](modules/tasks.md)                 | Required: task/assignment/value/version/order                    |
| FLOW-01 through FLOW-14     | [Workflows](modules/workflows.md)         | Required: atomic move/config/race/container creation             |
| RUN-01 through RUN-09       | [Runtime](modules/persistence-runtime.md) | Required: real PostgreSQL/Docker/seed/constraints                |
| WEB-01 through WEB-22       | [Web](modules/web-client.md)              | Required: browser journey and identity cleanup                   |
| API-01 through API-12       | [API/contracts](modules/api-contracts.md) | Required: standardized API and channel agreement                 |

## 3. Test environments

Use Jest/Supertest for backend rules and HTTP tests, with a real isolated PostgreSQL database for FKs, transactions, locking, and refresh concurrency. Pure field/status validators may be tested without database setup. Use Playwright for the required browser journey and Alice/Bob access demonstration.

Provide Docker test build targets and `make test` so host Node/Yarn/PostgreSQL is unnecessary. Test fixtures are independent of developer data. The private-Delivery example is not a mutation to the default demo seed. Use explicit test signing material, bounded timers, and deterministic data; never production secrets.

## 4. Required browser proof and defect handling

The minimum path is login -> select list -> expected resolved columns -> open task -> change custom answer -> save and verify persisted value. Add Alice logout/Bob login and assert the private branch disappears with no cached Alice data.

For a failure, report location, input, expected/actual outcome, and the owner/ADR. Fix the underlying rule rather than weakening the assertion. If three fixes fail, stop and name the doubtful assumption before another attempt. Record material AI-generated test corrections in AI_USAGE.md when application work begins.

## 5. Final evidence

| Check                   | Evidence required                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Domain/auth correctness | Passing actual required tests, including rollback and committed replay revocation.   |
| Schema                  | Real FK/index behavior and the accepted user-owned credential/session/token schema.  |
| Browser                 | Executed Playwright journey with persistence and permission difference.              |
| Delivery                | Clean Docker run, seed restart preservation, and actual test command output.         |
| Documentation           | Module/ADR/ER/contracts reflect final code and distinguish implemented/future scope. |
