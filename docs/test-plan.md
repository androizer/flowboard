# Application test plan and coverage

Status (2026-10-26): 66 API tests pass; 15 of 17 browser tests pass in the isolated Compose stack. The added hierarchy creation browser journeys currently fail while opening the Ant Design parent picker, so HIER-11, WEB-18, and WEB-20 remain unverified. A fresh local Compose boot and the documented Render API/web health endpoints returned 200. Navigation: [hub](README.md), [requirements](requirements.md).

## 1. Scope and meaning

The scenario rows in each module are the coverage target. The runnable `.tsx` suites are [API and database tests](../tests/api) and [browser journeys](../tests/web). A shared [TypeScript fixture](../tests/api/support.ts) seeds and resets data. The suites use an isolated PostgreSQL database and Playwright browser in a separate Compose project. Test titles name the scenario IDs they exercise; a named ID is not proof that every subcase in its row is covered.

Each module owns its detailed scenario rows. This page indexes them without duplicating their expected behavior. When rules change, update the owner scenarios and this index only if the group changes.

The plan has 141 scenario rows, not a requirement for 141 separate test files. Parameterized tests and shared fixtures can cover related rows. Preserve observable outcomes instead of mirroring internal implementation details.

## 2. Scenario owners

| Group                       | Owner and setup/action/outcome details    | Priority                                                         |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| AUTH-01 through AUTH-16     | [Identity](modules/identity.md)           | Required: login/session/rotation/revocation/reference invariants |
| HIER-01 through HIER-13     | [Hierarchy](modules/hierarchy.md)         | Required: tree/type/scope/archive/order/member creation          |
| PERM-01 through PERM-16     | [Permissions](modules/permissions.md)     | Required: role/grant/tree/direct URL consistency                 |
| STATUS-01 through STATUS-13 | [Statuses](modules/statuses.md)           | Required: inheritance/sibling columns/config safety              |
| FIELD-01 through FIELD-14   | [Custom fields](modules/custom-fields.md) | Required: six types/required/options/migration safety            |
| TASK-01 through TASK-11     | [Tasks](modules/tasks.md)                 | Required: task/assignment/value/version/order                    |
| FLOW-01 through FLOW-14     | [Workflows](modules/workflows.md)         | Required: atomic move/config/race/container creation             |
| RUN-01 through RUN-10       | [Runtime](modules/persistence-runtime.md) | Required: real PostgreSQL/Docker/seed/constraints                |
| WEB-01 through WEB-22       | [Web](modules/web-client.md)              | Required: browser journey and identity cleanup                   |
| API-01 through API-12       | [API/contracts](modules/api-contracts.md) | Required: standardized API and channel agreement                 |

## 3. Test environments

Jest/Supertest exercise the running API and real isolated PostgreSQL for FKs, transactions, locking, and refresh concurrency. Playwright exercises the required browser journey and Alice/Bob access demonstration.

Run `make test` from the repository root. It builds and runs the isolated test stack; host Node/Yarn/PostgreSQL is unnecessary. `yarn test:typecheck` checks the TypeScript suites without starting services. The database uses a separate `flowboard_test` name and temporary storage. Fixtures reset between cases, and the runner refuses any database URL without `flowboard_test`. Test signing material is explicit and development-only.

## 4. Outstanding coverage

The HIER-11/WEB-18/WEB-20 Playwright journeys now exist, but both new journeys fail before parent selection because the test cannot open the Ant Design picker; the uncertain assumption is that the visible picker surface is the click target in this browser setup. Stop further locator changes after three attempts and revisit the interaction with an inspected browser trace. AUTH-04 requires an SSO verifier, AUTH-14 requires credential-maintenance behavior that is not implemented, and WEB-19 is presentation guidance/color consistency that needs visual review rather than a superficial visibility assertion.

RUN-01 and RUN-09 are delivery checks. On 2026-10-26, the first test-stack boot exposed a missing `API_UPSTREAM` value in `compose.test.yml`; after adding it, the API suite passed 66/66 and the browser suite passed 15/17. The two hierarchy journey failures are described above. The regular development Compose stack then started from a stopped state; `/health` and `/` returned 200. The documented Render web and API endpoints also returned 200. Several test titles cover only part of a multi-clause scenario; do not claim all 141 rows are complete.

## 5. Required browser proof and defect handling

The minimum path is login -> select list -> expected resolved columns -> open task -> change custom answer -> save and verify persisted value. Add Alice logout/Bob login and assert the private branch disappears with no cached Alice data.

For a failure, report location, input, expected/actual outcome, and the owner/ADR. Fix the underlying rule rather than weakening the assertion. If three fixes fail, stop and name the doubtful assumption before another attempt. Record material AI-generated test corrections in AI_USAGE.md when application work begins.

## 6. Final evidence

| Check                   | Evidence required                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Domain/auth correctness | Passing actual required tests, including rollback and committed replay revocation.   |
| Schema                  | Real FK/index behavior and the accepted user-owned credential/session/token schema.  |
| Browser                 | Executed Playwright journey with persistence and permission difference.              |
| Delivery                | Clean Docker run, seed restart preservation, and actual test command output.         |
| Documentation           | Module/ADR/ER/contracts reflect final code and distinguish implemented/future scope. |
