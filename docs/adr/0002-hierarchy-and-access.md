# ADR-0002: Strict hierarchy, archival, and ancestor-aware access

Status: accepted for planned MVP. Owners: [hierarchy](../modules/hierarchy.md), [permissions](../modules/permissions.md), [identity](../modules/identity.md).

## Context

A person can guess a task URL even if a list is hidden in the sidebar. Container nesting also determines configuration. Ambiguous ancestry would make both access and inheritance hard to reason about.

## Decision

Use one workspace and the strict path workspace -> space -> folder -> list -> task. Store workspace separately and other containers in one table. Tasks have exactly one primary list. Archive rather than cascade-delete. Support sibling reordering, with no cross-parent container moves in this MVP.

Roles belong to workspace memberships, not global users or JWT claims. Active admins bypass grants. Members need access along the whole ancestor path; deny wins, private nodes need an allow at/before that node, and child grants cannot open a blocked parent. Members can edit tasks in accessible lists; container/config/grant administration is admin-only.

## Why

There is one clear path for each task's rules. User IDs remain stable if authentication changes. Reusing one container FK avoids polymorphic references for grants and config. Archival preserves assignment/value/history references.

## Alternatives and consequences

| Alternative | Reason not chosen |
| --- | --- |
| Arbitrary nested folders or direct space-to-list | More resolver cases than the assignment's specified tree. |
| Independent child permissions | Can expose children through private parents and complicates navigation. |
| Roles embedded as authority in JWTs | Delays role changes until tokens expire. |

Config safety checks include retained archived tasks so later definition removal cannot orphan stored data. This is stricter than merely keeping today's visible board valid.

## Change and verification

Changing nesting, grant precedence, root scope, or edit rights needs a decision revision and linked module updates. Verify type/scope foreign keys, archive visibility, denied direct URLs, admin behavior, and no access gained through assignment.
