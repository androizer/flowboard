# Complete Flowboard ER reference

Generated from the owned schema blocks in the module guides. Do not edit columns here independently.

Status: schema reference for the implemented Day 1 foundation and planned later phases. [Hub](README.md) | [Architecture](architecture.md) | [Business example](business-walkthrough.md)

Refresh with `python3 docs/tools/check_docs.py --write`; check with `python3 docs/tools/check_docs.py --check`.

The three views describe the same 16 tables; repeated boxes are the same entities. PK means primary key, FK foreign key, and UK unique key. A one-to-many line means one parent can have many child rows. Optional relationships can have no child or no referenced parent as labeled. Shared configuration validity is also checked by application workflows, not only foreign keys.

## 1. Identity, credentials, sessions, and membership

```mermaid
erDiagram
    USERS ||--o{ AUTH_IDENTITIES : has_login_identities
    USERS ||--o| USER_CREDENTIALS : optionally_has_local_password
    USERS ||--o{ AUTH_SESSIONS : owns
    AUTH_IDENTITIES ||--o{ AUTH_SESSIONS : authenticated_through
    AUTH_SESSIONS ||--o{ REFRESH_TOKENS : contains_token_history
    REFRESH_TOKENS o|--o| REFRESH_TOKENS : precedes
    USERS ||--o{ WORKSPACE_MEMBERSHIPS : participates_through
    WORKSPACES ||--o{ WORKSPACE_MEMBERSHIPS : has_members

    USERS {
        uuid id PK
        string display_name
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    AUTH_IDENTITIES {
        uuid id PK
        uuid user_id FK
        string issuer
        string subject
    }

    USER_CREDENTIALS {
        uuid user_id PK, FK
        string login_identifier UK
        string password_hash
        datetime password_changed_at
    }

    AUTH_SESSIONS {
        uuid id PK
        uuid user_id FK
        uuid auth_identity_id FK
        datetime created_at
        datetime expires_at
        datetime revoked_at "Nullable"
    }

    REFRESH_TOKENS {
        uuid id PK
        uuid session_id FK
        uuid parent_token_id FK "Nullable for first token"
        string token_hash UK
        datetime created_at
        datetime expires_at
        datetime consumed_at "Nullable until rotated"
    }

    WORKSPACES {
        uuid id PK
        string name
    }

    WORKSPACE_MEMBERSHIPS {
        uuid workspace_id PK, FK
        uuid user_id PK, FK
        string role "admin, member"
        boolean is_active
    }
```

## 2. Hierarchy, permissions, and configuration

```mermaid
erDiagram
    WORKSPACES ||--o{ WORKSPACE_MEMBERSHIPS : has_members
    WORKSPACES ||--o{ CONTAINERS : contains
    CONTAINERS o|--o{ CONTAINERS : parents
    CONTAINERS ||--o{ CONTAINER_GRANTS : has_grants
    WORKSPACE_MEMBERSHIPS ||--o{ CONTAINER_GRANTS : receives
    WORKSPACES ||--o{ STATUS_SETS : scopes
    CONTAINERS o|--o| STATUS_SETS : optionally_owns
    STATUS_SETS ||--|{ STATUSES : contains
    WORKSPACES ||--o{ CUSTOM_FIELD_DEFINITIONS : scopes
    CONTAINERS ||--o{ CUSTOM_FIELD_DEFINITIONS : defines
    CUSTOM_FIELD_DEFINITIONS ||--o{ CUSTOM_FIELD_OPTIONS : offers

    WORKSPACES {
        uuid id PK
        string name
    }

    WORKSPACE_MEMBERSHIPS {
        uuid workspace_id PK, FK
        uuid user_id PK, FK
        string role "admin, member"
        boolean is_active
    }

    CONTAINERS {
        uuid id PK
        uuid workspace_id FK
        uuid parent_container_id FK "Nullable for spaces"
        string parent_type "Null for spaces; space for folders; folder for lists"
        string type "space, folder, list"
        string name
        string visibility "public, private"
        decimal position
        datetime archived_at "Nullable"
        datetime created_at
        datetime updated_at
    }

    CONTAINER_GRANTS {
        uuid id PK
        uuid workspace_id FK
        uuid container_id FK
        uuid user_id FK
        string mode "allow, deny"
    }

    STATUS_SETS {
        uuid id PK
        uuid workspace_id FK
        uuid owner_container_id FK "Null for workspace default"
        datetime created_at
        datetime updated_at
    }

    STATUSES {
        uuid id PK
        uuid status_set_id FK
        string key
        string name
        string category
        string color
        decimal position
    }

    CUSTOM_FIELD_DEFINITIONS {
        uuid id PK
        uuid workspace_id FK
        uuid owner_container_id FK
        string key
        string name
        string type
        boolean required
        decimal position
        datetime created_at
        datetime updated_at
    }

    CUSTOM_FIELD_OPTIONS {
        uuid id PK
        uuid field_definition_id FK
        string label
        string color
        decimal position
    }
```

## 3. Tasks, assignments, and custom values

```mermaid
erDiagram
    USERS ||--o{ WORKSPACE_MEMBERSHIPS : participates_through
    WORKSPACES ||--o{ WORKSPACE_MEMBERSHIPS : has_members
    WORKSPACES ||--o{ CONTAINERS : contains
    CONTAINERS o|--o{ CONTAINERS : parents
    WORKSPACES ||--o{ CUSTOM_FIELD_DEFINITIONS : scopes
    CONTAINERS ||--o{ CUSTOM_FIELD_DEFINITIONS : defines
    WORKSPACES ||--o{ TASKS : scopes
    CONTAINERS ||--o{ TASKS : list_holds
    USERS ||--o{ TASKS : creates
    TASKS ||--o{ TASK_ASSIGNEES : has
    WORKSPACE_MEMBERSHIPS ||--o{ TASK_ASSIGNEES : assigned_through
    TASKS ||--o{ TASK_FIELD_VALUES : stores
    CUSTOM_FIELD_DEFINITIONS ||--o{ TASK_FIELD_VALUES : describes

    WORKSPACES {
        uuid id PK
        string name
    }

    CONTAINERS {
        uuid id PK
        uuid workspace_id FK
        uuid parent_container_id FK "Nullable for spaces"
        string parent_type "Null for spaces; space for folders; folder for lists"
        string type "space, folder, list"
        string name
        string visibility "public, private"
        decimal position
        datetime archived_at "Nullable"
        datetime created_at
        datetime updated_at
    }

    USERS {
        uuid id PK
        string display_name
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    WORKSPACE_MEMBERSHIPS {
        uuid workspace_id PK, FK
        uuid user_id PK, FK
        string role "admin, member"
        boolean is_active
    }

    TASKS {
        uuid id PK
        uuid workspace_id FK
        uuid primary_list_id FK
        string primary_list_type "Always list"
        uuid created_by_user_id FK
        string title
        string description "Nullable"
        string status_key
        string priority
        datetime due_date "Nullable"
        decimal position
        int version
        datetime archived_at "Nullable"
        datetime created_at
        datetime updated_at
    }

    TASK_ASSIGNEES {
        uuid task_id PK, FK
        uuid user_id PK, FK
        uuid workspace_id FK
    }

    CUSTOM_FIELD_DEFINITIONS {
        uuid id PK
        uuid workspace_id FK
        uuid owner_container_id FK
        string key
        string name
        string type
        boolean required
        decimal position
        datetime created_at
        datetime updated_at
    }

    TASK_FIELD_VALUES {
        uuid task_id PK, FK
        uuid field_definition_id PK, FK
        uuid workspace_id FK
        jsonb value
    }
```

## Table owners

| Table                    | Single owning guide                       |
| ------------------------ | ----------------------------------------- |
| USERS                    | [identity](modules/identity.md)           |
| AUTH_IDENTITIES          | [identity](modules/identity.md)           |
| USER_CREDENTIALS         | [identity](modules/identity.md)           |
| WORKSPACE_MEMBERSHIPS    | [identity](modules/identity.md)           |
| AUTH_SESSIONS            | [identity](modules/identity.md)           |
| REFRESH_TOKENS           | [identity](modules/identity.md)           |
| WORKSPACES               | [hierarchy](modules/hierarchy.md)         |
| CONTAINERS               | [hierarchy](modules/hierarchy.md)         |
| CONTAINER_GRANTS         | [permissions](modules/permissions.md)     |
| STATUS_SETS              | [statuses](modules/statuses.md)           |
| STATUSES                 | [statuses](modules/statuses.md)           |
| CUSTOM_FIELD_DEFINITIONS | [custom-fields](modules/custom-fields.md) |
| CUSTOM_FIELD_OPTIONS     | [custom-fields](modules/custom-fields.md) |
| TASKS                    | [tasks](modules/tasks.md)                 |
| TASK_ASSIGNEES           | [tasks](modules/tasks.md)                 |
| TASK_FIELD_VALUES        | [tasks](modules/tasks.md)                 |

## Business rules that are not simple foreign keys

| Rule                                                                                              | Owner                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A task's container must be a list and its ancestry active.                                        | [Hierarchy](modules/hierarchy.md) and [workflows](modules/workflows.md) |
| Task status_key must belong to its list's resolved set; there is no direct global status FK.      | [Statuses](modules/statuses.md)                                         |
| JSONB answers must match effective types, required rules, and option IDs.                         | [Custom fields](modules/custom-fields.md)                               |
| A session's user and authenticating identity must match; credentials belong directly to the user. | [Identity](modules/identity.md)                                         |
| Session revoked_at is the refresh-family revocation source; token rows have no revoked_at.        | [Identity](modules/identity.md)                                         |
| Moves and config edits validate every affected retained record before a single commit.            | [Workflows](modules/workflows.md)                                       |

Migration history and seed-version bookkeeping are infrastructure metadata, not extra business tables.
