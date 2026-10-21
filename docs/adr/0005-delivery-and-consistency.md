# ADR-0005: Atomic workflows, predictable HTTP, and Docker-first delivery

Status: accepted for planned MVP. Owners: [workflows](../modules/workflows.md), [runtime](../modules/persistence-runtime.md), [API](../modules/api-contracts.md), [test plan](../test-plan.md).

## Context

Moves and config edits span several owners. Reviewers should run the application from a Docker-only machine. The user wants test scenarios written during development and implemented after feature freeze.

## Decision

Use versioned REST, one error envelope, offset/limit collection pages, Swagger, and a real-login curl cookbook. Domain writes lock the workspace row and recheck membership/access/config inside the transaction. Task versions detect stale edits. Board configuration/tasks use one consistent snapshot. Auth rotation uses session/token locks separately.

Run web/API/PostgreSQL with one Compose command, persistent data, idempotent seeds, and local generated signing material. No extra service is required. Record application test TODOs first, then implement required cases after Day 3 freeze. Static/documentation/build checks can run throughout.

## Why

Small-scale serialization is easy to explain and prevents validation/write races. The HTTP contract works across browser and curl. Docker and deterministic data make reviewer behavior reproducible. Delaying executable tests follows the user's selected development process without removing submission tests.

## Alternatives and consequences

| Alternative                          | Reason not chosen                                     |
| ------------------------------------ | ----------------------------------------------------- |
| Fine-grained locking immediately     | More lock-order cases than this small workload needs. |
| Queue/cache/worker in the MVP        | Adds operational work without a required feature.     |
| Automatic retries for every mutation | Can duplicate effects or mask refresh consumption.    |

Workspace write locking is a throughput limit. Per-instance login throttling is not global enforcement across replicas. Future activity/search can use transactional outbox plus idempotent consumers, retries, dead letters, and eventual consistency. That future design is not a shipped feature.

## Change and verification

Revise this ADR for new deployment units, transaction/lock policy, HTTP conventions, or test scheduling. Verify failed moves/config edits leave data unchanged, schema/seed restarts are safe, no secret appears in artifacts/logs, and the final required tests run in Docker.
