# Flowboard project instructions

## Read before implementation

Start at [docs/README.md](docs/README.md). Read the owning module guide, its ADRs, public callers, and test TODOs before changing behavior. The module guides are the source of truth; [architecture](docs/architecture.md) owns dependency policy, and [API/contracts](docs/modules/api-contracts.md) owns HTTP conventions.

Application behavior may be planned or implemented. Do not claim it is implemented because documentation or diagrams exist. Follow the [requirements](docs/requirements.md) and owning [module guide](docs/README.md); do not start an unrelated feature just because it appears in future design notes.

## Preserve boundaries and accepted identity design

Repositories remain owned by their domain. Cross-domain task/config changes go through workflows and one shared transaction context. Do not bypass access, effective configuration, or version checks in a controller/repository. Keep the Nx dependency graph acyclic; web imports shared contracts rather than backend libraries.

Credentials belong directly to USERS through USER_CREDENTIALS.user_id. Local and future SSO verification converge before the same Flowboard session/token service. Session identity must belong to its user. Session revoked_at is the refresh-family revocation source. Do not introduce credentials.auth_identity_id, refresh_tokens.revoked_at, provider-token-based domain APIs, or independent SSO session issuance without an explicit ADR revision.

## Change and verify

Use [docs/change-guide.md](docs/change-guide.md). Update the owner spec and any affected ADR/contracts/callers with the change. If documents conflict, resolve the discrepancy explicitly instead of silently following whichever is convenient.

Owned schema blocks in module guides generate the combined ER. Run:

```bash
python3 docs/tools/check_docs.py --write
python3 docs/tools/check_docs.py --check
```

During Days 1-3, maintain application test TODOs and run appropriate static/build/manual checks. Do not generate executable application tests or empty passing suites until the planned feature freeze. Day 4 implements and runs required tests. Documentation validation is separate from application test coverage. Follow the user's later explicit instruction if they change this schedule.

Record substantive AI corrections and rejected output in AI_USAGE.md once implementation begins. Preserve unrelated user work and confirm destructive resets. Do not commit secrets or log credentials/tokens.
