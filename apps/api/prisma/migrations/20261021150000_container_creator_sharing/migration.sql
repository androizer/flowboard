-- Preserve existing containers. Earlier releases did not record who created them,
-- so their creator remains unknown until explicitly repaired from trusted evidence.
ALTER TABLE containers ADD COLUMN created_by_user_id uuid;

ALTER TABLE containers
  ADD CONSTRAINT containers_creator_membership_fkey
  FOREIGN KEY (workspace_id, created_by_user_id)
  REFERENCES workspace_memberships(workspace_id, user_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX containers_workspace_id_created_by_user_id_idx
  ON containers(workspace_id, created_by_user_id);
