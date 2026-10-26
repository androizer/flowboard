# ADR-0003: Replace status sets, accumulate fields, block unsafe changes

Status: accepted for planned MVP. Owners: [statuses](../modules/statuses.md), [custom fields](../modules/custom-fields.md), [workflows](../modules/workflows.md).

## Context

Two lists under one folder may need different columns, and custom fields can be defined higher in the tree. Moves and config edits can invalidate existing tasks. I chose predictable replacement and addition rules instead of trying to migrate existing tasks automatically.

## Decision

The nearest complete status set replaces its ancestor: list -> folder -> space -> workspace default. Tasks store stable status keys. Every resolved set needs not_started, active, and done categories.

Fields accumulate from space -> folder -> list. Keys are immutable and workspace-unique; child definitions cannot override inherited keys. Values reference definitions, and select values use option IDs. Preserve the six required field types.

Reject invalidating configuration changes instead of silently remapping statuses or discarding values. A cross-list move must explicitly provide a replacement status, missing destination values, and any source-only clearing.

## Why

The rule can be explained before code is written. Status keys keep label/order changes safe. Adding fields is simpler than merging potentially incompatible child schemas. Rejection preserves user data and makes migration decisions visible.

## Alternatives and consequences

| Alternative                                    | Reason not chosen                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Merge statuses by key with hide/override rules | More inheritance states to validate and explain.                       |
| Child field overrides                          | Changes meaning/requirements/options for the same field down the tree. |
| Automatic remapping or stripping               | Requires migration policy/UI and may surprise users.                   |

Config screens must distinguish local and inherited data and explain blockers. A local copied set becomes independent. Safety checks inspect all affected retained task records, not only one list's visible page.

## Change and verification

Changing inheritance, key identity, migration policy, or field-value representation needs this ADR and all resolver/move examples updated. Tests must cover sibling sets, required values, invalid options/types, ancestor changes, and safe rollback.
