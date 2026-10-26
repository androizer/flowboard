# ADR-0004: User-owned credentials and a shared Flowboard session system

Status: accepted for planned MVP. Owner: [identity and authentication](../modules/identity.md). References: [original ER](../references/auth-identity-er.png), [token history](../references/session-token-er.png), [shared flow](../references/shared-sign-in-flow.png).

## Context

The user selected real local login with JWT and refresh tokens, while requiring a simple future SSO extension. The original reference diagrams must remain consistent with the implementation plan.

## Decision

USERS is stable application identity. USER_CREDENTIALS has user_id as PK/FK directly to USERS; it is optional for a user. AUTH_IDENTITIES independently maps issuer/subject to that user. Sessions record both user and authenticating identity, enforced as a matching pair. A local user has a pre-provisioned local identity; SSO-only users need no password row.

Local and future SSO verifiers produce the same VerifiedSignIn pair before one shared Flowboard session/token service. Both methods use Flowboard access JWTs, session revocation, and refresh rotation. Provider tokens do not become business API credentials.

Session revocation is the token-family revocation source. REFRESH_TOKENS records hashes, consumption, expiry, and predecessor history; no token-level revoked_at column or separate family table is added. Exact reference columns live in the identity guide.

The JWT signing secret comes from `JWT_SECRET` when configured; otherwise local startup reads or generates the secret file. Refresh-cookie `Secure` behavior is controlled separately by `COOKIE_SECURE`, so hosted demo seeding can remain enabled while cookies still require HTTPS.

## Why

Adding a sign-in method changes identity proof, not task references or business permissions. One session service avoids parallel logout/renewal behavior. The database prevents mixing one user's session with another user's login identity. Hashes protect stored refresh secrets; current membership checks keep authorization independent from tokens.

## Alternatives and consequences

| Alternative                            | Reason not chosen                                                      |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Credentials owned by AUTH_IDENTITIES   | Contradicts the accepted user-owned credential ER.                     |
| Direct provider tokens for domain APIs | Moves provider coupling into all API authentication paths.             |
| Stateless JWTs without session checks  | Existing tokens cannot be revoked immediately on logout/replay.        |
| Cookie session only                    | Simpler, but JWT plus rotating refresh tokens was explicitly selected. |

Strict replay handling can revoke a session after an ambiguous network failure or simultaneous token reuse. The client serializes refresh and does not blindly retry it. The extra session lookup and database history are intentional costs. Four-day delivery is tighter than with mock identity.

## Change and verification

Revise this ADR before changing credential ownership, reference columns, convergence point, session authority, browser storage, or accepted API token issuer. Verify exact schema columns, same-user identity FK, local/SSO test-double convergence, rotation/replay commit order, logout, and immediate access revocation. Actual provider integration remains future scope.
