export type Actor = { userId: string; workspaceId: string; role: 'admin' | 'member' };
export type ErrorEnvelope = {
  error: { code: string; message: string; details?: Array<{ path: string; reason: string }> };
};
export type Page<T> = {
  items: T[];
  page: { offset: number; limit: number; total: number; hasMore: boolean };
};
export const API_VERSION = 'v1';

export type Container = {
  id: string;
  name: string;
  type: 'space' | 'folder' | 'list';
  parentContainerId: string | null;
};
export type StatusDefinition = {
  id: string;
  key: string;
  name: string;
  category: 'not_started' | 'active' | 'done' | 'closed';
  color: string;
  position: number;
};
export type FieldDefinition = {
  id: string;
  key: string;
  name: string;
  type: 'text' | 'number' | 'single_select' | 'multi_select' | 'date' | 'checkbox';
  required: boolean;
  ownerContainerId: string;
  options: Array<{ id: string; label: string; color: string }>;
};
export type TaskProjection = {
  id: string;
  primaryListId: string;
  title: string;
  description: string | null;
  statusKey: string;
  priority: 'urgent' | 'high' | 'normal' | 'low' | 'none';
  dueDate: string | null;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  assignees: Array<{ id: string; name: string }>;
  customFields: Record<string, unknown>;
};
export type BoardResponse = {
  list: {
    id: string;
    name: string;
    path: Array<{ id: string; name: string; type: Container['type'] }>;
  };
  statuses: StatusDefinition[];
  statusSource: { type: string; id: string };
  fields: FieldDefinition[];
  items: TaskProjection[];
  page: Page<TaskProjection>['page'];
};
export type WorkspaceOverview = {
  workspaceId: string;
  totals: { visibleTasks: number; accessibleLists: number; dueSoon: number };
  dueSoonWindow: { startsAt: string; endsBefore: string };
  lists: Array<{
    id: string;
    name: string;
    path: Array<Pick<Container, 'id' | 'name' | 'type'>>;
    taskCount: number;
  }>;
  upcoming: Array<{
    id: string;
    title: string;
    primaryListId: string;
    dueDate: string;
  }>;
};
