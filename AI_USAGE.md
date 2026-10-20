# AI usage record

## 2026-10-20 — Day 1 implementation

- Created the initial monorepo, Docker topology, Prisma schema/migration, demo seed, web shell, and NestJS authentication/hierarchy foundation from the accepted module specifications.
- Corrected an initial Prisma schema draft that used semicolon-separated declarations; Prisma requires one definition per line.
- Preserved the accepted authentication design: credentials are user-owned, session revocation is held only on `AUTH_SESSIONS`, and refresh-token replay commits session revocation before returning 401.
- Deferred executable application tests until Day 4 as required by the roadmap. Type checks, builds, Prisma client generation, and documentation validation were run during Day 1.
- Changed clean-seed local login identifiers from short usernames to email-shaped identifiers. This preserves the accepted user-owned credential model and does not treat an email as a provider identity link.
- Corrected the initial USERS schema to include created_at and updated_at audit timestamps. The user requested that this belong in the initial migration rather than an incremental migration; the identity ER source and Prisma model were updated together.
- Clarified the future SSO migration: USER_CREDENTIALS can be retired without deleting USERS or AUTH_IDENTITIES, but the local email-shaped login identifier is otherwise lost. Add/backfill a user-owned primary_email as profile/migration data before credential retirement, while provider identities remain explicitly verified and linked by issuer/subject rather than email.
