# Flowboard documentation hub

Status: Day 1 foundation is implemented (runtime, schema/seed, local auth, initial hierarchy); the remaining MVP behavior is planned.

Start here. These documents explain what Flowboard does, why it is structured this way, and how to build one part without accidentally breaking another.

## 1. Find the right guide

| I want to understand... | Read |
| --- | --- |
| The whole application and module links | [Architecture](architecture.md) and [business walkthrough](business-walkthrough.md) |
| When to build each part | [Implementation roadmap](implementation-plan.md) |
| Every table and relationship | [Complete ER reference](er-diagram.md) |
| A particular user action and its diagrams | [Workflow index](workflow-index.md) |
| Assignment coverage and tests | [Requirements](requirements.md) and [test plan](test-plan.md) |
| How to make a future change safely | [Change guide](change-guide.md) and [glossary](glossary.md) |

## 2. Module guides: the source of truth for behavior

Each guide contains a plain-language example, ownership, decisions, links, interfaces, diagrams, failure cases, build steps, and test TODOs.

| Module | What it does | Main data |
| --- | --- | --- |
| [Identity and authentication](modules/identity.md) | Signs people in, renews access, resolves the current person | Users, identities, credentials, memberships, sessions, refresh tokens |
| [Hierarchy](modules/hierarchy.md) | Organizes workspace, spaces, folders, and lists | Workspaces, containers |
| [Permissions](modules/permissions.md) | Decides what the current person can see or change | Container grants |
| [Statuses](modules/statuses.md) | Finds the correct columns for a selected list | Status sets, statuses |
| [Custom fields](modules/custom-fields.md) | Defines additional task inputs and validates answers | Field definitions, options |
| [Tasks](modules/tasks.md) | Stores work items, assignments, values, and order | Tasks, assignments, field values |
| [Application workflows](modules/workflows.md) | Coordinates operations that touch several modules | No additional tables |
| [Persistence and runtime](modules/persistence-runtime.md) | Runs PostgreSQL, transactions, migrations, seeds, and Docker | Infrastructure only |
| [Web client](modules/web-client.md) | Presents login, navigation, board, table, detail, and configuration | No browser-owned business database |
| [API and contracts](modules/api-contracts.md) | Gives clients one predictable HTTP language | No additional tables |

## 3. Where decisions live

| Record | Decision |
| --- | --- |
| [ADR-0001](adr/0001-modular-monolith.md) | Nx/Yarn, module boundaries, React/AntD, NestJS/PostgreSQL |
| [ADR-0002](adr/0002-hierarchy-and-access.md) | Strict hierarchy, archival, membership, grants |
| [ADR-0003](adr/0003-scoped-configuration.md) | Replacement status sets, additive fields, safe configuration edits |
| [ADR-0004](adr/0004-authentication.md) | User-owned credentials and shared local/SSO sessions and tokens |
| [ADR-0005](adr/0005-delivery-and-consistency.md) | Transactions, API conventions, Docker, testing, future IPC |

An ADR records why a decision was made. The owning module guide states its exact current behavior. An implementation change updates both when it changes that decision. If they conflict, resolve the conflict explicitly; do not silently choose whichever is easier.

## 4. One authority per detail

The module guide owns its rules, public module interfaces, table definitions, examples, and test scenarios. The API/contracts guide owns HTTP route names and common request/response rules. The runtime guide owns bootstrap and seed rules. The architecture guide owns the allowed dependency graph. The roadmap owns timing, not feature semantics.

The complete ER reference is generated from schema blocks in owning module guides. Do not edit its table columns independently. The old [monolithic plan](archive/2026-10-20-monolithic-plan.md) is preserved only as historical evidence and is not an additional source of requirements.

Refresh and check documentation with:

```bash
python3 docs/tools/check_docs.py --write
python3 docs/tools/check_docs.py --check
```

These commands check documentation. They do not implement or run application tests. Mermaid diagrams describe planned behavior; they are not evidence that the application already works.

## 5. Suggested reading order

1. Read the architecture and business walkthrough for the overall picture.
2. Read identity and hierarchy for who a person is and where work lives.
3. Read permissions, statuses, custom fields, and tasks for the business rules.
4. Read workflows and API/web guides for how a user action crosses the system.
5. Follow the roadmap and the change guide before implementing a phase.
