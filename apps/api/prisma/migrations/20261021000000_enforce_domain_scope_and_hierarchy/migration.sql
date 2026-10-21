-- Preserve existing data. If a prior write crossed a workspace or hierarchy
-- boundary, stop here so it can be repaired deliberately before deployment.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM containers child
    LEFT JOIN containers parent ON parent.id = child.parent_container_id
    WHERE (child.type = 'space' AND child.parent_container_id IS NOT NULL)
       OR (child.type = 'folder' AND (
         parent.id IS NULL OR parent.workspace_id <> child.workspace_id OR parent.type <> 'space'
       ))
       OR (child.type = 'list' AND (
         parent.id IS NULL OR parent.workspace_id <> child.workspace_id OR parent.type <> 'folder'
       ))
  ) THEN
    RAISE EXCEPTION 'Existing containers violate the workspace or space/folder/list hierarchy';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tasks task
    JOIN containers list ON list.id = task.primary_list_id
    WHERE list.workspace_id <> task.workspace_id OR list.type <> 'list'
  ) THEN
    RAISE EXCEPTION 'Existing tasks reference a foreign-workspace or non-list container';
  END IF;

  IF EXISTS (
    SELECT 1 FROM container_grants grant_row
    JOIN containers owner ON owner.id = grant_row.container_id
    WHERE owner.workspace_id <> grant_row.workspace_id
  ) OR EXISTS (
    SELECT 1 FROM status_sets status_set
    JOIN containers owner ON owner.id = status_set.owner_container_id
    WHERE owner.workspace_id <> status_set.workspace_id
  ) OR EXISTS (
    SELECT 1 FROM custom_field_definitions definition
    JOIN containers owner ON owner.id = definition.owner_container_id
    WHERE owner.workspace_id <> definition.workspace_id
  ) THEN
    RAISE EXCEPTION 'Existing grant or configuration owner references another workspace';
  END IF;

  IF EXISTS (
    SELECT 1 FROM task_assignees assignee
    JOIN tasks task ON task.id = assignee.task_id
    WHERE task.workspace_id <> assignee.workspace_id
  ) OR EXISTS (
    SELECT 1 FROM task_field_values answer
    JOIN tasks task ON task.id = answer.task_id
    JOIN custom_field_definitions definition ON definition.id = answer.field_definition_id
    WHERE task.workspace_id <> answer.workspace_id
       OR definition.workspace_id <> answer.workspace_id
  ) THEN
    RAISE EXCEPTION 'Existing task assignment or answer references another workspace';
  END IF;
END $$;

ALTER TABLE containers ADD COLUMN parent_type "ContainerType";
UPDATE containers
SET parent_type = CASE type
  WHEN 'folder' THEN 'space'::"ContainerType"
  WHEN 'list' THEN 'folder'::"ContainerType"
  ELSE NULL
END;

ALTER TABLE tasks ADD COLUMN primary_list_type "ContainerType" NOT NULL DEFAULT 'list';

ALTER TABLE containers
  ADD CONSTRAINT containers_strict_parent_type CHECK (
    (type = 'space' AND parent_container_id IS NULL AND parent_type IS NULL)
    OR (type = 'folder' AND parent_container_id IS NOT NULL
        AND parent_type IS NOT NULL AND parent_type = 'space')
    OR (type = 'list' AND parent_container_id IS NOT NULL
        AND parent_type IS NOT NULL AND parent_type = 'folder')
  );
ALTER TABLE tasks
  ADD CONSTRAINT tasks_primary_list_type_is_list CHECK (primary_list_type = 'list');

-- PostgreSQL requires an exact unique key for every composite FK target.
ALTER TABLE containers
  ADD CONSTRAINT containers_id_workspace_id_key UNIQUE (id, workspace_id),
  ADD CONSTRAINT containers_id_workspace_id_type_key UNIQUE (id, workspace_id, type);
ALTER TABLE tasks
  ADD CONSTRAINT tasks_id_workspace_id_key UNIQUE (id, workspace_id);
ALTER TABLE custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_id_workspace_id_key UNIQUE (id, workspace_id);
ALTER TABLE status_sets DROP CONSTRAINT status_sets_owner_container_id_key;
ALTER TABLE status_sets
  ADD CONSTRAINT status_sets_owner_container_id_workspace_id_key
  UNIQUE (owner_container_id, workspace_id);

ALTER TABLE containers DROP CONSTRAINT containers_parent_container_id_fkey;
ALTER TABLE container_grants DROP CONSTRAINT container_grants_container_id_fkey;
ALTER TABLE status_sets DROP CONSTRAINT status_sets_owner_container_id_fkey;
ALTER TABLE custom_field_definitions DROP CONSTRAINT custom_field_definitions_owner_container_id_fkey;
ALTER TABLE tasks DROP CONSTRAINT tasks_primary_list_id_fkey;
ALTER TABLE task_assignees DROP CONSTRAINT task_assignees_task_id_fkey;
ALTER TABLE task_field_values DROP CONSTRAINT task_field_values_task_id_fkey;
ALTER TABLE task_field_values DROP CONSTRAINT task_field_values_field_definition_id_fkey;

ALTER TABLE containers
  ADD CONSTRAINT containers_parent_scope_type_fkey
  FOREIGN KEY (parent_container_id, workspace_id, parent_type)
  REFERENCES containers(id, workspace_id, type)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE container_grants
  ADD CONSTRAINT container_grants_container_scope_fkey
  FOREIGN KEY (container_id, workspace_id)
  REFERENCES containers(id, workspace_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE status_sets
  ADD CONSTRAINT status_sets_owner_scope_fkey
  FOREIGN KEY (owner_container_id, workspace_id)
  REFERENCES containers(id, workspace_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_owner_scope_fkey
  FOREIGN KEY (owner_container_id, workspace_id)
  REFERENCES containers(id, workspace_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_primary_list_scope_type_fkey
  FOREIGN KEY (primary_list_id, workspace_id, primary_list_type)
  REFERENCES containers(id, workspace_id, type)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE task_assignees
  ADD CONSTRAINT task_assignees_task_scope_fkey
  FOREIGN KEY (task_id, workspace_id)
  REFERENCES tasks(id, workspace_id)
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE task_field_values
  ADD CONSTRAINT task_field_values_task_scope_fkey
  FOREIGN KEY (task_id, workspace_id)
  REFERENCES tasks(id, workspace_id)
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE task_field_values
  ADD CONSTRAINT task_field_values_definition_scope_fkey
  FOREIGN KEY (field_definition_id, workspace_id)
  REFERENCES custom_field_definitions(id, workspace_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX task_field_values_definition_scope_idx
  ON task_field_values(field_definition_id, workspace_id);

COMMIT;
