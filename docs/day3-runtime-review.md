# Day 3 runtime review — 2026-10-21

This is manual browser and HTTP smoke evidence from a separate `flowboard-codex-day3` Docker Compose project with its own PostgreSQL and signing volumes. It is not Day 4 executable application test coverage. The browser was the Codex in-app browser through MCP Computer Use, including Playwright locator assertions; there was no dedicated MCP Playwright server in this session. Temporary HTTP probes and screenshots were kept under `/private/tmp`, not added to the application test suite.

## Result

The first pass had 58 passing assertions and two task-creation HTTP 500s. Browser task edit and corrected move also returned HTTP 500 before the fix. After changing task persistence, the task edit persisted, the corrected move committed, browser task creation succeeded, and all 18 follow-up HTTP assertions passed. The initial 58 assertions were not rerun as a single suite after the fix; affected paths were rerun directly. Browser evidence: `/private/tmp/flowboard-day3-move-verified.png`, `/private/tmp/flowboard-day3-create-verified.png`, `/private/tmp/flowboard-day3-status-blocker.png`, and `/private/tmp/flowboard-day3-required-impact-blocker.png`.

The failure was in `TasksService.create/update`: nested Prisma assignment and answer writes raised `PrismaClientValidationError` and the API filter returned HTTP 500. Those writes now execute as ordered task, assignment, and answer operations inside the workflow's existing database transaction. The observable task contract and version rules did not change.

## Cases exercised

1. **Permissions — PERM-01–12 except foreign-workspace grant target.** Alice saw all branches; Bob's Security allow and Carol's Strategy allow/Delivery deny resolved correctly. Parent deny beat child allow, and a child-only allow could not open a private parent. Guessed assigned task URLs, member config/container/grant writes, and moves with either an inaccessible source or destination returned 403. Bob's overview and tree had no private Product data. An inactive admin save and inactive grant target were rejected. A held workspace lock followed by membership revocation caused the waiting admin save to fail without changing the status set.
2. **Statuses — STATUS-01–12.** Backlog inherited Engineering, Delivery kept its replacement set, and Roadmap used the workspace default. A temporary Q2 Launch folder set governed Security while local Backlog and Delivery stayed independent; reset restored Security's Engineering inheritance. Malformed sets returned 400; referenced live or archived keys and incompatible reset returned 409 without mutation. Ancestor and workspace-default edits reached inheritors while lower overrides stayed independent. Color and order edits kept stable task keys and were restored. An archived inheriting list with an archived task blocked removal of its referenced default status. A rejected browser editor draft remained visible.
3. **Fields — FIELD-01–13.** All six types resolved; zero and false persisted. Invalid answer types, dates, options, and required clears returned 400 with `customFields` paths. Duplicate keys, used field/type/option deletion, new required fields, and archived unanswered required toggles were blocked. A field used only by an archived task also resisted deletion. Unused option removal and option reorder preserved answer IDs.
4. **Web — WEB-01–02, 08, 10–14 in their Day 3 portions; WEB-07 partly.** Login, Backlog board/table, custom answer persistence, Alice→Bob identity cleanup, inherited/local admin editors, 409 draft retention, corrected cross-list move, and member admin hiding were observed. The moved task kept its ID/shared answers and explicitly cleared source-only answers. A Roadmap move with source-only clears but no required Impact answer stayed blocked without mutating the task.
5. **Workflows — FLOW-02–04 sampled.** Missing source-only clear, incompatible destination status, and inaccessible destination failed without changing list/version; a corrected move committed.

## Remaining proof

1. Day 4 automated PostgreSQL and Playwright tests are still TODOs in the owning module guides; this review did not replace them.
2. The foreign-workspace grant-target branch of PERM-12 has no fixture because the MVP supports one workspace. The membership race used a controlled isolated-database fixture and should be repeated as an automated test on Day 4.
3. WEB-03–06 and WEB-09 auth coordination, stale-edit, and drag cases were outside this Day 3 admin-focused pass. The deferred second-channel and complete Swagger proof remain on the roadmap.

The isolated stack remains available on `http://localhost:8080` for inspection. Its test data intentionally differs from the default demo seed; use a fresh Compose project for a clean demonstration.
