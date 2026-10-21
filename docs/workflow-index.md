# Where to find each workflow and sequence diagram

Status: planned behavior. Navigation: [hub](README.md), [API routes](modules/api-contracts.md), [business example](business-walkthrough.md).

Use this index when starting from a user action rather than a module name. Each linked owner guide contains the workflow/sequence diagrams and failure rules. Similar operations deliberately share a diagram when their authorization/transaction order is identical.

## 1. Sign-in and session actions

| Action                                                   | Diagram/rule owner                                                            | Acceptance cases              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| Local password login                                     | [Identity](modules/identity.md): local/SSO convergence and login sequence     | AUTH-01 through AUTH-03       |
| Future SSO login                                         | [Identity](modules/identity.md): shared convergence; test double only in MVP  | AUTH-04, AUTH-05              |
| Authenticated request                                    | [Identity](modules/identity.md): request/logout sequence                      | AUTH-06, AUTH-07              |
| Refresh and consumed-token replay                        | [Identity](modules/identity.md): refresh/replay sequence                      | AUTH-08 through AUTH-10       |
| Logout, logout-all, credential maintenance               | [Identity](modules/identity.md): revocation rules and request/logout sequence | AUTH-11, AUTH-14              |
| Browser reload, expiry, concurrent tabs, identity switch | [Web](modules/web-client.md): reload flow and serialized-refresh sequence     | WEB-02 through WEB-04, WEB-09 |

## 2. Navigation and hierarchy

| Action                                          | Diagram/rule owner                                                                                                                             | Acceptance cases          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Load a permission-filtered tree                 | [Permissions](modules/permissions.md): filtered-tree sequence                                                                                  | PERM-01 through PERM-05   |
| Open list/board or guessed task URL             | [Permissions](modules/permissions.md), [workflows](modules/workflows.md): authorize before data                                                | PERM-06, FLOW-01          |
| Create space/folder/list                        | [Hierarchy](modules/hierarchy.md): create-list workflow/sequence with parent-specific validation                                               | HIER-01, HIER-02          |
| Rename/visibility change/reorder                | [Hierarchy](modules/hierarchy.md): same admin transaction path; parent unchanged; [permissions](modules/permissions.md) for visibility effects | HIER-03, HIER-04, HIER-08 |
| Archive container or access archived descendant | [Hierarchy](modules/hierarchy.md): archive sequence                                                                                            | HIER-05, HIER-06          |

## 3. Tasks and views

| Action                                   | Diagram/rule owner                                                                                                        | Acceptance cases                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Create or edit task/assignees/built-ins  | [Tasks](modules/tasks.md): create/edit workflow/sequence                                                                  | TASK-01 through TASK-05           |
| Render/edit custom answers               | [Custom fields](modules/custom-fields.md): resolve/validate and save sequences; [web](modules/web-client.md): task drawer | FIELD-01 through FIELD-06, WEB-01 |
| Change status or reorder within a column | [Tasks](modules/tasks.md): placement sequence; [workflows](modules/workflows.md): board/drag sequence                     | TASK-06, TASK-07, WEB-06          |
| Move between lists                       | [Workflows](modules/workflows.md): move flow and sequence; [business example](business-walkthrough.md)                    | FLOW-02 through FLOW-04           |
| Archive task                             | [Tasks](modules/tasks.md): same authorized/versioned write transaction, retained references, placement compaction         | TASK-08                           |
| Sort/page board or table                 | [Workflows](modules/workflows.md), [tasks](modules/tasks.md), [API](modules/api-contracts.md)                             | FLOW-01, FLOW-09, TASK-09, API-04 |

## 4. Configuration and grants

| Action                                                    | Diagram/rule owner                                                                               | Acceptance cases                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Resolve statuses or copy inherited set                    | [Statuses](modules/statuses.md): resolution flow/sequence and local-copy rule                    | STATUS-01 through STATUS-03          |
| Add/edit/remove/reorder statuses or reset local set       | [Statuses](modules/statuses.md), [workflows](modules/workflows.md): candidate-impact transaction | STATUS-04 through STATUS-10, FLOW-05 |
| Add/edit/remove field, change required/type/options/order | [Custom fields](modules/custom-fields.md): candidate schema/safety sequence                      | FIELD-07 through FIELD-10            |
| Upsert or remove allow/deny grant                         | [Permissions](modules/permissions.md): admin grant sequence                                      | PERM-01 through PERM-10, FLOW-06     |
| Explain a rejected admin change                           | [Web](modules/web-client.md): config sequence                                                    | WEB-08                               |

## 5. Infrastructure and future changes

| Action                                      | Diagram/rule owner                                                                                  | Acceptance cases                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Clean Docker boot, migration, seed, restart | [Runtime](modules/persistence-runtime.md): boot flow/sequence and idempotent seed rules             | RUN-01 through RUN-03                   |
| Commit or roll back multi-owner writes      | [Runtime](modules/persistence-runtime.md): atomic-write sequence; [workflows](modules/workflows.md) | RUN-05, RUN-06, FLOW-06 through FLOW-08 |
| Serve the second channel                    | [API](modules/api-contracts.md): common HTTP sequence/cookbook                                      | API-01, API-06                          |
| Change a rule or schema safely              | [Change guide](change-guide.md); module diagrams and derived ER are updated together                | Documentation check                     |
| Extract async activity/search later         | [Architecture](architecture.md), [ADR-0005](adr/0005-delivery-and-consistency.md)                   | Future design only                      |
