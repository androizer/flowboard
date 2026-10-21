# How to change a module without losing the design

Navigation: [hub](README.md), [architecture](architecture.md), [requirements](requirements.md).

## 1. Find the owner first

Use the hub's module table. For example, a new select-field rule belongs to custom fields; moving a task between lists belongs to workflows; a JWT/session rule belongs to identity. If several owners are affected, list all of them before changing a public contract.

Guides distinguish implemented Day 1–2 behavior from planned Day 3–4 behavior. Mark a behavior implemented only after its code and relevant verification exist. Do not infer implementation status from a diagram or a finished document.

## 2. Make the decision concrete

Write a small before/after example. State the trigger, expected result, failure result, and affected stored data. Keep the existing assignment requirements visible. A bug fix restoring documented behavior normally does not need a new ADR; changing the decision does.

If a proposal conflicts with an accepted ADR, explicitly amend/supersede it and update the affected module guides in the same change. Do not silently weaken a validator or import rule to make a new feature easier.

## 3. Apply one bounded change

1. Read the owning guide, relevant ADR, linked callers, and test TODOs.
2. Update the owner document and any changed HTTP/other-module contracts; preserve simple examples.
3. Update code/migrations and affected callers together when implementation is underway.
4. Refresh the derived ER and run documentation/type/lint/build/boundary checks.
5. Update test TODOs during development; after the test freeze, implement/run affected tests and record results.

Avoid unrelated cleanup in the same change. An AI prompt should name the owner, applicable decisions, allowed edits, expected example, and acceptance cases. Log useful corrections and rejected AI output in the future AI_USAGE.md.

## 4. Keep diagrams and schemas synchronized

The only manually owned table definitions are schema blocks in module guides. Run `python3 docs/tools/check_docs.py --write` after changing them. The generated ER is a reading aid, not a second place to invent columns. Update the documentation checker and ADR explicitly if an intentional auth schema revision changes a protected reference invariant.

Update the workflow and sequence diagrams when the order of validation, locking, commit, or response changes. A new arrow between modules must also be allowed by the architecture dependency policy. Examples, endpoint tables, rollback descriptions, and test TODOs must agree.

## 5. Review questions

| Question                                      | Example of an accidental regression                                   |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Did ownership change?                         | Credentials suddenly reference an auth identity instead of the user.  |
| Did a caller bypass a workflow?               | A config controller deletes a status without checking tasks.          |
| Did commit/failure order change?              | Refresh replay throws before committing session revocation.           |
| Did inherited scope change?                   | List-only fields silently become workspace-wide.                      |
| Did a future design become a claimed feature? | Documentation says SSO works although only the local verifier exists. |
