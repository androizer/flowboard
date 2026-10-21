# Module: permissions

Status: Day 2 tree/list/task access and Day 3 grant administration routes/UI added; [manual Day 3 runtime review](../day3-runtime-review.md) completed, Day 4 executable tests pending. Code owner: `apps/api/src/permissions`. Navigation: [hub](../README.md), [ADR-0002](../adr/0002-hierarchy-and-access.md), [hierarchy](hierarchy.md).

## 1. Purpose and example

Permissions decides which doors a signed-in person may open. Bob may be a workspace member without seeing every private list. Alice is an active admin and can see/administer the whole workspace.

Engineering and Q2 Launch are public. Security is private. Bob has allow on Security, so he can open it and edit its tasks. Carol has no allow and cannot see it. If Q2 Launch explicitly denies Bob, a Security allow does not bypass that denied ancestor.

Signing in is handled by identity. A private branch is not secured merely by hiding it in React. Backend tree, board, task, configuration, and move paths must use the same policy.

## 2. Ownership, data, and decisions

Grants belong to this module; users/memberships belong to identity and containers to hierarchy.

<!-- schema:start -->

```mermaid
erDiagram
    CONTAINERS ||--o{ CONTAINER_GRANTS : has_grants
    WORKSPACE_MEMBERSHIPS ||--o{ CONTAINER_GRANTS : receives

    CONTAINER_GRANTS {
        uuid id PK
        uuid workspace_id FK
        uuid container_id FK
        uuid user_id FK
        string mode "allow, deny"
    }
```

<!-- schema:end -->

One grant per `(workspace_id, container_id, user_id)`; updating mode replaces that decision, not adds a conflicting second row. Composite FKs require a member and container in the same workspace.

| Decision                   | Result                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Membership first           | Inactive users/memberships are rejected before any admin bypass.                                                                                                |
| Admin                      | Active admin bypasses public/private/grant restrictions.                                                                                                        |
| Deny precedence            | Any deny on the resource path blocks a member, even with a later allow.                                                                                         |
| Private node               | Needs an allow at that node or an already-visited ancestor. A later child allow cannot reopen an inaccessible parent.                                           |
| Creation vs administration | Members create under accessible parents and manage direct grants on containers they created and can still access. Other container/config writes are admin-only. |

Public nodes require active membership, access through every parent, and no denied ancestor. Thus a public folder under a private space is open only to members who can reach that space; public never overrides its parent. An inherited allow can open private descendants unless a deny blocks them. Assignment never grants access. Team grants, role hierarchies, and per-action edit grants are future scope.

## 3. Connections and interfaces

| Connection     | Contract                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Identity       | Receives a trusted current Actor, never raw token/body roles. Workflow refreshes membership inside writes.  |
| Hierarchy      | Reads one ordered path from space to target; rejects archived or invalid scope through hierarchy.           |
| Workflows      | `assertCanReadContainer`, `assertCanEditTasks`, `assertAdmin`, filtered tree decisions, both sides of move. |
| Web            | Gets already-filtered data and optional capability flags; UI hiding never replaces a server check.          |
| Own repository | Loads grants in a bounded batch for the actor/path, avoiding per-node permission queries.                   |

Keep raw grant rows and blocking path details private from ordinary member error messages. A forbidden response must not list inaccessible sibling/container names. Admin config screens may show their own grant data.

The tree keeps accessible containers even if no visible children remain. It does not insert placeholders for private branches or promote children whose parents are hidden. The Work overview receives its list scope from this same filtered tree inside one read snapshot; private-list counts and task titles cannot leak through summary totals. Existing inaccessible resources return 403; missing/archived resources return 404 according to hierarchy rules.

## 4. Workflows and sequence diagrams

### Path evaluation

```mermaid
flowchart TD
    Actor["Active Actor and target path"] --> Admin{"Admin?"}
    Admin -->|Yes| Permit["Allow"]
    Admin -->|No| Deny{"Any explicit deny on path?"}
    Deny -->|Yes| Block["403 or omit from tree"]
    Deny -->|No| Walk["Walk ancestors from root to target"]
    Walk --> Allow["Carry forward allows seen so far"]
    Allow --> Private{"Private node without allow so far?"}
    Private -->|Yes| Block
    Private -->|No, continue through all nodes| Permit
```

```mermaid
sequenceDiagram
    participant Web as Bob's browser
    participant Flow as Board workflow
    participant H as Hierarchy
    participant P as Permissions
    participant Config as Resolvers and tasks
    Web->>Flow: Open Security
    Flow->>H: Load active list and ancestor path
    Flow->>P: Evaluate current Actor against full path
    P->>P: Read relevant grants; deny/private rules
    alt Bob has valid access
        P-->>Flow: Allowed
        Flow->>Config: Load resolved board data
        Flow-->>Web: Board
    else Access blocked
        P-->>Flow: Forbidden
        Flow-->>Web: 403 without board/config data
    end
```

### Filter a tree

```mermaid
sequenceDiagram
    participant Web as Member browser
    participant Flow as Tree workflow
    participant H as Hierarchy
    participant P as Permissions
    Web->>Flow: GET tree
    Flow->>H: Load active candidate nodes
    Flow->>P: Batch grants and evaluate paths
    P-->>Flow: Visible node IDs with accessible parents
    Flow-->>Web: Filtered tree
```

A task URL check resolves its actual list first. It must not rely on a caller-supplied list ID. A move checks access to the stored source and requested destination within the domain transaction.

### Change a grant

```mermaid
sequenceDiagram
    participant Admin as Alice or creator sharing UI
    participant Flow as Grant workflow
    participant ID as Identity
    participant H as Hierarchy
    participant P as Permissions
    participant DB as Transaction coordinator
    Admin->>Flow: Set allow/deny or remove explicit rule
    Flow->>DB: Begin and lock workspace
    Flow->>ID: Refresh active Actor and target membership
    Flow->>H: Check target active container and workspace
    Flow->>P: Require admin or accessible exact-container creator; upsert/delete grant
    Flow->>DB: Commit
    Note over Flow,P: Subsequent tree/task requests use the new rule
    Flow-->>Admin: Updated rule or no-content removal
```

Changing a container's public/private flag follows the hierarchy admin transaction and affects subsequent permission evaluation. It does not copy grants onto descendants or rewrite task assignments.

## 5. Build phases, failure cases, and change guide

Build the backend policy with hierarchy in Days 1-2, apply it to every workflow before UI completion, and add admin grant controls in Day 3. Do not defer enforcement until after task APIs exist.

Direct allow/deny grants target active members only. Active admins already bypass grants, so the grant picker excludes them and the API rejects an admin target with 400. This keeps the administration screen from suggesting an admin can remove their own workspace access through a container rule.

A member-created private container receives a system-created allow for its creator in the same transaction as creation. The creator can later read, allow, deny, or remove direct grants on that exact live container while still able to access its full path. They cannot edit their own grant. A creator's new allow is rejected when the recipient cannot access the parent path; they must share the private parent through its creator or an admin first. Admins can manage any container's grants, including blocked-child scenarios. A direct allow inherited from a parent can make private descendants accessible. Ordinary members still cannot bypass a denied/private ancestor to create below it.

| ID      | Test TODO: setup/action -> expected result                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERM-01 | Alice active admin -> all active branches and task edits/admin actions accessible.                                                                                  |
| PERM-02 | Bob opens tree and overview -> private Strategy and its task counts hidden; Security allow respected.                                                               |
| PERM-03 | Carol opens tree -> Roadmap visible through allowed Strategy; Delivery denied.                                                                                      |
| PERM-04 | Deny on parent and allow on child -> still 403; no child promoted into tree.                                                                                        |
| PERM-05 | Private parent without allow, allow only on child -> parent blocks access.                                                                                          |
| PERM-06 | Guessed task URL -> stored list's permissions enforced.                                                                                                             |
| PERM-07 | Assigned task in inaccessible list -> assignment does not make it visible.                                                                                          |
| PERM-08 | Inactive admin membership -> no bypass; reject.                                                                                                                     |
| PERM-09 | Member may create under accessible parent and manage only their own accessible container grants; config, other grants, rename, visibility, archive, reorder -> 403. |
| PERM-10 | Move with either side inaccessible -> no mutation; no destination schema leak.                                                                                      |
| PERM-11 | Revoked admin membership during grant/config write -> fresh role check rejects after workspace lock.                                                                |
| PERM-12 | Inactive or foreign grant target -> 400; switching allow/deny replaces one row.                                                                                     |
| PERM-13 | Admin appears in member directory but not grant picker; forged admin grant target -> 400, no row.                                                                   |
| PERM-14 | Bob shares his private list with Carol -> Carol sees it if all parents are accessible; unrelated member grant edit -> 403.                                          |
| PERM-15 | Public folder under private space -> hidden from unallowed member; child allow cannot reopen parent; parent allow reveals descendants.                              |
| PERM-16 | Creator share to member blocked by private/denied parent -> 400; self-grant change/remove -> 400; inactive creator -> rejected.                                     |

Changing precedence or edit rights requires [ADR-0002](../adr/0002-hierarchy-and-access.md), the tree/direct-access examples, and all read/write workflow call sites to change together. Do not implement different permission algorithms per screen.
