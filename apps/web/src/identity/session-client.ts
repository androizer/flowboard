import type {
  BoardResponse,
  Container,
  ErrorEnvelope,
  TaskProjection,
  WorkspaceOverview,
} from '@flowboard/contracts';

export type Actor = { userId: string; workspaceId: string; role: 'admin' | 'member' };

type AccessTokenResponse = { accessToken: string };
type ApiError = Partial<ErrorEnvelope> & { message?: string };

async function api<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Partial<ApiError>;
    throw new Error(
      payload.error?.message ?? payload.message ?? 'Something went wrong. Please try again.',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function login(loginIdentifier: string, password: string) {
  return api<AccessTokenResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginIdentifier, password }),
  });
}

export function refresh() {
  return api<AccessTokenResponse>('/v1/auth/refresh', { method: 'POST' });
}

export function getCurrentActor(accessToken: string) {
  return api<Actor>('/v1/me', {}, accessToken);
}

export async function logout(accessToken: string) {
  try {
    await api<void>('/v1/auth/logout', { method: 'POST' }, accessToken);
  } catch {
    /* Local state still must be cleared. */
  }
}

export type { Container };

export function getTree(accessToken: string) {
  return api<{ workspaceId: string; items: Container[] }>('/v1/tree', {}, accessToken);
}

export function getWorkspaceOverview(accessToken: string, workspaceId: string) {
  return api<WorkspaceOverview>(`/v1/workspaces/${workspaceId}/overview`, {}, accessToken);
}

export function getBoard(accessToken: string, listId: string, offset = 0) {
  return api<BoardResponse>(
    `/v1/lists/${listId}/board?offset=${offset}&limit=100`,
    {},
    accessToken,
  );
}

export async function getAllBoardPages(accessToken: string, listId: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const first = await getBoard(accessToken, listId);
    const items = [...first.items];
    let page = first.page;
    let changed = false;
    while (page.hasMore) {
      const next = await getBoard(accessToken, listId, items.length);
      if (
        JSON.stringify(next.statuses) !== JSON.stringify(first.statuses) ||
        JSON.stringify(next.fields) !== JSON.stringify(first.fields)
      ) {
        changed = true;
        break;
      }
      items.push(...next.items);
      page = next.page;
    }
    if (!changed) return { ...first, items, page };
  }
  throw new Error('The list changed while loading. Please reload it.');
}

export function getTask(accessToken: string, id: string) {
  return api<TaskProjection>(`/v1/tasks/${id}`, {}, accessToken);
}
export async function getMembers(accessToken: string) {
  const items: Array<{ id: string; name: string }> = [];
  let hasMore = true;
  while (hasMore) {
    const result = await api<{
      items: Array<{ id: string; name: string }>;
      page: { hasMore: boolean };
    }>(`/v1/users?offset=${items.length}&limit=100`, {}, accessToken);
    if (result.page.hasMore && result.items.length === 0)
      throw new Error('The member list changed while loading. Please reload it.');
    items.push(...result.items);
    hasMore = result.page.hasMore;
  }
  return { items };
}
export function createTask(accessToken: string, listId: string, body: unknown) {
  return api<TaskProjection>(
    `/v1/lists/${listId}/tasks`,
    { method: 'POST', body: JSON.stringify(body) },
    accessToken,
  );
}
export function updateTask(accessToken: string, id: string, body: unknown) {
  return api<TaskProjection>(
    `/v1/tasks/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    accessToken,
  );
}
export function placeTask(accessToken: string, id: string, body: unknown) {
  return api<TaskProjection>(
    `/v1/tasks/${id}/placement`,
    { method: 'POST', body: JSON.stringify(body) },
    accessToken,
  );
}
