# Flowboard documentation

Use this page to find the design and behavior details that do not belong in the [project README](../README.md).

## Product and delivery

| Topic                                                     | Document                                    |
| --------------------------------------------------------- | ------------------------------------------- |
| Product assignment and required outcomes                  | [Product brief](flowboard-module.md)        |
| Requirements mapped to acceptance evidence                | [Requirements](requirements.md)             |
| Application scenarios, runnable suites, and coverage gaps | [Test plan](test-plan.md)                   |
| Web performance as data grows                             | [Web performance guide](web-performance.md) |
| Optional hosted demo and manual release deployments        | [Deployment guide](deployment.md)            |
| Optional real-time, activity, and board interaction work  | [Stretch goals](stretch-goals.md)            |
| Shared project vocabulary                                 | [Glossary](glossary.md)                     |

## System design

| Topic                                               | Document                                        |
| --------------------------------------------------- | ----------------------------------------------- |
| System boundaries, dependencies, and data ownership | [Architecture](architecture.md)                 |
| Complete data model, generated from module schemas  | [ER reference](er-diagram.md)                   |
| End-to-end product example                          | [Business walkthrough](business-walkthrough.md) |
| User and system workflows                           | [Workflow index](workflow-index.md)             |

## Architecture decisions

ADRs record why major design choices were made. Current behavior and implementation details live in the owning module guide.

| ADR                                          | Decision                                                 |
| -------------------------------------------- | -------------------------------------------------------- |
| [0001](adr/0001-modular-monolith.md)         | Modular monolith and technology boundaries               |
| [0002](adr/0002-hierarchy-and-access.md)     | Workspace hierarchy and access rules                     |
| [0003](adr/0003-scoped-configuration.md)     | Inherited statuses and custom fields                     |
| [0004](adr/0004-authentication.md)           | User credentials and shared session/token service        |
| [0005](adr/0005-delivery-and-consistency.md) | Transactions, HTTP conventions, runtime, and consistency |

## Module guides

Each guide owns its module's behavior, data, interfaces, workflows, failure cases, and application test scenarios. The [test plan](test-plan.md) tracks executable coverage.

| Module                                    | Guide                                                     |
| ----------------------------------------- | --------------------------------------------------------- |
| Identity and authentication               | [identity](modules/identity.md)                           |
| Workspace hierarchy                       | [hierarchy](modules/hierarchy.md)                         |
| Permissions and grants                    | [permissions](modules/permissions.md)                     |
| Status configuration                      | [statuses](modules/statuses.md)                           |
| Custom fields                             | [custom fields](modules/custom-fields.md)                 |
| Tasks and task values                     | [tasks](modules/tasks.md)                                 |
| Cross-module operations                   | [workflows](modules/workflows.md)                         |
| Database, migrations, and Compose runtime | [persistence and runtime](modules/persistence-runtime.md) |
| Web application                           | [web client](modules/web-client.md)                       |
| HTTP conventions and client contracts     | [API and contracts](modules/api-contracts.md)             |

## Maintaining the docs

Read the [change guide](change-guide.md) before changing documented behavior. Use the checker to validate owned schemas, protected identity rules, required test scenarios, architecture dependency policy, and Markdown links. It also regenerates the ER reference from schema blocks in the module guides:

```bash
python3 docs/tools/check_docs.py --write  # regenerate ER reference and validate
python3 docs/tools/check_docs.py --check  # validate without writing
```

The checker validates documentation only. It does not run the application or its tests. API routes and their available request/response documentation are exposed by the running API's Swagger UI at `/docs`.
