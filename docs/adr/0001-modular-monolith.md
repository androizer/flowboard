# ADR-0001: One backend with enforceable module boundaries

Status: accepted for planned MVP. Owners: [architecture](../architecture.md), [web](../modules/web-client.md), [runtime](../modules/persistence-runtime.md).

## Context

The project fits in one API, but its domain rules still need clear boundaries. Keeping ownership explicit helps prevent those rules from spreading across controllers. I was already familiar with Ant Design and Nx, so they were a practical fit for the web app and workspace tooling.

## Decision

Use Nx with Yarn Workspaces, React/Vite/AntD, NestJS, PostgreSQL/Prisma, and three Compose services. Each backend domain is an Nx project. The application workflows coordinate cross-domain actions through exported services. Repositories remain private to their owner. The architecture guide contains the allowed dependency graph.

## Why

This keeps the operational setup small while making boundaries visible in imports, reviews, and the project graph. Shared TypeScript contracts help browser and curl channels use the same API. AntD provides the table, tree, drawer, and form controls the product needs.

## Alternatives and consequences

| Alternative           | Reason not chosen                                                                  |
| --------------------- | ---------------------------------------------------------------------------------- |
| Microservices now     | Adds deployment, IPC, retry, and consistency work before the domain is proven.     |
| Plain workspaces only | Simpler scaffolding, but lacks our selected Nx project graph and boundary tooling. |
| Custom UI controls    | More design work than the assignment needs.                                        |

Nx does not validate business rules. Import constraints, module specs, and later domain tests are all required. No hosted Nx service is required for the supported Docker path.

## Change and verification

Change this ADR if deployment units, core stack, or ownership/import policy changes. Verify the dependency graph is acyclic, frontend cannot import backend internals, and domain controllers cannot bypass workflow validation.
