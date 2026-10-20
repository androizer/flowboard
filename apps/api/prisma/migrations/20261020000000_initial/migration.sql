CREATE TYPE "ContainerType" AS ENUM ('space','folder','list');
CREATE TYPE "Visibility" AS ENUM ('public','private');
CREATE TYPE "MembershipRole" AS ENUM ('admin','member');
CREATE TYPE "GrantMode" AS ENUM ('allow','deny');
CREATE TYPE "StatusCategory" AS ENUM ('not_started','active','done','closed');
CREATE TYPE "FieldType" AS ENUM ('text','number','single_select','multi_select','date','checkbox');
CREATE TYPE "Priority" AS ENUM ('urgent','high','normal','low','none');

CREATE TABLE workspaces (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE users (
  id uuid PRIMARY KEY, display_name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL
);
CREATE TABLE containers (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), parent_container_id uuid REFERENCES containers(id) ON DELETE SET NULL,
  type "ContainerType" NOT NULL, name text NOT NULL, visibility "Visibility" NOT NULL DEFAULT 'public', position decimal(18,6) NOT NULL,
  archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL
);
CREATE TABLE auth_identities (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), issuer text NOT NULL, subject text NOT NULL,
  UNIQUE (issuer, subject), UNIQUE (id, user_id)
);
CREATE TABLE user_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id), login_identifier text NOT NULL UNIQUE, password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id), user_id uuid NOT NULL REFERENCES users(id), role "MembershipRole" NOT NULL,
  is_active boolean NOT NULL DEFAULT true, PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), auth_identity_id uuid NOT NULL REFERENCES auth_identities(id),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
  UNIQUE (id, user_id)
);
CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES auth_sessions(id), parent_token_id uuid UNIQUE REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE container_grants (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), container_id uuid NOT NULL REFERENCES containers(id), user_id uuid NOT NULL,
  mode "GrantMode" NOT NULL, UNIQUE (workspace_id, container_id, user_id),
  FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id)
);
CREATE TABLE status_sets (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), owner_container_id uuid UNIQUE REFERENCES containers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL
);
CREATE TABLE statuses (
  id uuid PRIMARY KEY, status_set_id uuid NOT NULL REFERENCES status_sets(id) ON DELETE CASCADE, key text NOT NULL, name text NOT NULL,
  category "StatusCategory" NOT NULL, color text NOT NULL, position decimal(18,6) NOT NULL, UNIQUE (status_set_id, key)
);
CREATE TABLE custom_field_definitions (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), owner_container_id uuid NOT NULL REFERENCES containers(id),
  key text NOT NULL, name text NOT NULL, type "FieldType" NOT NULL, required boolean NOT NULL DEFAULT false, position decimal(18,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL, UNIQUE (workspace_id, key)
);
CREATE TABLE custom_field_options (
  id uuid PRIMARY KEY, field_definition_id uuid NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  label text NOT NULL, color text NOT NULL, position decimal(18,6) NOT NULL
);
CREATE TABLE tasks (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), primary_list_id uuid NOT NULL REFERENCES containers(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, description text, status_key text NOT NULL,
  priority "Priority" NOT NULL DEFAULT 'none', due_date timestamptz, position decimal(18,6) NOT NULL, version integer NOT NULL DEFAULT 1,
  archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL
);
CREATE TABLE task_assignees (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id), workspace_id uuid NOT NULL,
  PRIMARY KEY (task_id, user_id), FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id)
);
CREATE TABLE task_field_values (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, field_definition_id uuid NOT NULL REFERENCES custom_field_definitions(id),
  workspace_id uuid NOT NULL, value jsonb NOT NULL, PRIMARY KEY (task_id, field_definition_id)
);

CREATE INDEX containers_parent_order_idx ON containers(workspace_id, parent_container_id, position);
CREATE INDEX session_user_expiry_idx ON auth_sessions(user_id, expires_at);
CREATE INDEX refresh_session_idx ON refresh_tokens(session_id);
CREATE INDEX grant_member_idx ON container_grants(workspace_id, user_id);
CREATE INDEX task_placement_idx ON tasks(primary_list_id, status_key, position);
CREATE INDEX task_due_idx ON tasks(workspace_id, due_date);

-- Protected identity invariants Prisma cannot express directly.
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_identity_belongs_to_user
  FOREIGN KEY (auth_identity_id, user_id) REFERENCES auth_identities(id, user_id);
CREATE UNIQUE INDEX one_workspace_default_status_set ON status_sets(workspace_id) WHERE owner_container_id IS NULL;
