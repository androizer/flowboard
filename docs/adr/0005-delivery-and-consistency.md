# ADR-0005: Atomic workflows, predictable HTTP, and Docker-first delivery

Status: accepted for planned MVP. Owners: [workflows](../modules/workflows.md), [runtime](../modules/persistence-runtime.md), [API](../modules/api-contracts.md), [test plan](../test-plan.md).

## Context

Moves and config edits span several owners. I want reviewers to be able to run the application with Docker alone. I also want to document test scenarios during development, then implement them after the feature freeze.

## Decision

Use versioned REST, one error envelope, offset/limit collection pages, Swagger, and a real-login curl cookbook. I deferred the cookbook and second-channel verification during Day 3, so that assignment evidence is still pending. Domain writes lock the workspace row and recheck membership, access, and configuration inside the transaction. Task versions detect stale edits. Board configuration and tasks use one consistent snapshot. Auth rotation uses separate session and token locks.

Run web/API/PostgreSQL locally with one Compose command, persistent data, idempotent seeds, and generated signing material unless a local `JWT_SECRET` is supplied. The optional short-lived hosted demo uses separate Render Docker services and Neon PostgreSQL. Render automatic deploys stay off; a manually dispatched GitHub Actions workflow targets a selected GitHub release tag and API, web, or both services. Release creation itself does not deploy. Record application test TODOs first, then implement required cases after Day 3 freeze. Static/documentation/build checks can run throughout.

## Why

Workspace-level serialization is easy to explain and prevents validation/write races at this scale. The HTTP contract works for both the browser and curl. Docker and deterministic data make the review setup reproducible. Writing test scenarios before implementing them keeps the development schedule clear without dropping the required tests.

## Alternatives and consequences

| Alternative                          | Reason not chosen                                     |
| ------------------------------------ | ----------------------------------------------------- |
| Fine-grained locking immediately     | More lock-order cases than this small workload needs. |
| Queue/cache/worker in the MVP        | Adds operational work without a required feature.     |
| Automatic retries for every mutation | Can duplicate effects or mask refresh consumption.    |

Workspace write locking is a throughput limit. Per-instance login throttling is not global enforcement across replicas. Future activity/search can use transactional outbox plus idempotent consumers, retries, dead letters, and eventual consistency. That future design is not a shipped feature.

## Change and verification

Revise this ADR for new deployment units, transaction/lock policy, HTTP conventions, or test scheduling. Verify failed moves/config edits leave data unchanged, schema/seed restarts are safe, no secret appears in artifacts/logs, and the final required tests run in Docker.
