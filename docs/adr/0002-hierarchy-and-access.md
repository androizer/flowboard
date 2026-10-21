# ADR-0002: Strict hierarchy, archival, and ancestor-aware access

Status: accepted for planned MVP. Owners: [hierarchy](../modules/hierarchy.md), [permissions](../modules/permissions.md), [identity](../modules/identity.md).

## Context

A person can guess a task URL even if a list is hidden in the sidebar. Container nesting also determines configuration. Ambiguous ancestry would make both access and inheritance hard to reason about.

## Decision

Use one workspace and the strict path workspace -> space -> folder -> list -> task. Store workspace separately and other containers in one table. Tasks have exactly one primary list. Archive rather than cascade-delete. Support sibling reordering, with no cross-parent container moves in this MVP.

Enforce the fixed parent and task-list types with row checks and typed composite foreign keys. Workspace-scoped references include the workspace ID in their foreign keys; workflows still check active ancestry, access, and effective configuration before writes.

Roles belong to workspace memberships, not global users or JWT claims. Active admins bypass grants. Members need access along the whole ancestor path; deny wins, private nodes need an allow at/before that node, and child grants cannot open a blocked parent. Members can edit tasks in accessible lists and create spaces at the workspace root or folders/lists under an accessible parent. Creation uses the same fresh-membership check and workspace transaction as other writes. Every new container records its creator; a private container created by a member also receives an allow grant for that creator in the same transaction so it remains accessible. The creator of an accessible container can read and change direct grants on that exact container. An admin can manage grants on any container. Renaming, visibility changes, archival, sibling reordering, and configuration remain admin-only.

“Public” is relative to the path: a public space is available to active workspace members, while a public folder/list is available to members who can access every parent and have no deny on the path. A public folder inside a private space never makes that space or folder visible to all workspace members. Sharing a private child requires the recipient to have access to each private parent first; only its parent creator or an admin can share that parent. An allow on a parent carries into descendants, including private ones, unless a deny blocks the path. A creator cannot alter their own grant through self-service sharing. Existing containers without recorded creator remain admin-managed until their creator is established from trusted evidence.

Direct grants target active members, not admins. Since admins bypass grant evaluation, an allow or deny row for an admin would misrepresent their actual access.

## Why

There is one clear path for each task's rules. User IDs remain stable if authentication changes. Reusing one container FK avoids polymorphic references for grants and config. Archival preserves assignment/value/history references.

## Alternatives and consequences

| Alternative                                      | Reason not chosen                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Arbitrary nested folders or direct space-to-list | More resolver cases than the assignment's specified tree.               |
| Independent child permissions                    | Can expose children through private parents and complicates navigation. |
| Roles embedded as authority in JWTs              | Delays role changes until tokens expire.                                |

Config safety checks include retained archived tasks so later definition removal cannot orphan stored data. This is stricter than merely keeping today's visible board valid.

The assignment requires a hierarchy but does not specify who may create its containers or who may share a member-created private container. It describes public visibility and private allows without defining their intersection with ancestor access. The earlier admin-only creation and sharing rules were MVP choices. Browser review revised them so ordinary members can organize accessible work and share containers they created. Ancestor access remains mandatory; the UI describes public children as open to people with parent access.

## Change and verification

Changing nesting, grant precedence, root scope, or edit rights needs a decision revision and linked module updates. Verify type/scope foreign keys, archive visibility, denied direct URLs, admin behavior, and no access gained through assignment.
