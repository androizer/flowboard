import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  BoardResponse,
  Container,
  CurrentUser,
  ErrorEnvelope,
  TaskProjection,
  WorkspaceOverview,
  WorkspaceMember,
} from '@flowboard/contracts';

export type Actor = CurrentUser;

type AccessTokenResponse = { accessToken: string };
type ApiError = Partial<ErrorEnvelope> & { message?: string };
type RetriableRequest = InternalAxiosRequestConfig & {
  _flowboardRetried?: boolean;
  _flowboardSessionEpoch?: number;
  _flowboardToken?: string;
};

const apiClient = axios.create({ withCredentials: true });
let activeAccessToken: string | undefined;
let sessionEpoch = 0;
let refreshInFlight: Promise<string> | undefined;
let onSessionExpired: (() => void) | undefined;
const sessionChannel =
  typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('flowboard-session');

function expireSession(broadcast = true) {
  activeAccessToken = undefined;
  sessionEpoch++;
  if (broadcast) sessionChannel?.postMessage({ type: 'session-expired' });
  onSessionExpired?.();
}

sessionChannel?.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === 'session-expired' || event.data?.type === 'identity-changed')
    expireSession(false);
});

export function setAccessToken(accessToken: string | undefined) {
  activeAccessToken = accessToken;
  sessionEpoch++;
  sessionChannel?.postMessage({ type: 'identity-changed' });
}

export function setSessionExpiredHandler(handler: (() => void) | undefined) {
  onSessionExpired = handler;
}

function errorMessage(error: AxiosError<ApiError>) {
  return (
    error.response?.data?.error?.message ??
    error.response?.data?.message ??
    'Something went wrong. Please try again.'
  );
}

async function refreshWithLock(expectedEpoch = sessionEpoch): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  if (typeof navigator === 'undefined' || !navigator.locks) {
    expireSession(false);
    throw new Error('This browser cannot safely coordinate session refresh. Please sign in again.');
  }
  refreshInFlight = (async () => {
    const lockResult = await navigator.locks.request('flowboard-refresh', async () => {
      if (sessionEpoch !== expectedEpoch)
        throw new Error('The signed-in user changed. Please retry your action.');
      const response = await apiClient.post<AccessTokenResponse>('/v1/auth/refresh');
      const accessToken = response.data.accessToken;
      if (sessionEpoch !== expectedEpoch)
        throw new Error('The signed-in user changed. Please retry your action.');
      activeAccessToken = accessToken;
      return accessToken;
    });
    return await lockResult;
  })();
  try {
    return await refreshInFlight;
  } catch (error) {
    if (sessionEpoch === expectedEpoch) expireSession();
    throw error;
  } finally {
    refreshInFlight = undefined;
  }
}

apiClient.interceptors.request.use((request) => {
  const tracked = request as RetriableRequest;
  if (tracked._flowboardRetried && tracked._flowboardSessionEpoch !== sessionEpoch)
    return Promise.reject(new Error('The signed-in user changed. Please retry your action.'));
  if (!tracked._flowboardRetried) tracked._flowboardSessionEpoch = sessionEpoch;
  const token = activeAccessToken;
  if (token) {
    tracked._flowboardToken = token;
    tracked.headers.set('Authorization', `Bearer ${token}`);
  }
  return tracked;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const request = error.config as RetriableRequest | undefined;
    const url = request?.url ?? '';
    const isLoginOrRefresh = url.includes('/v1/auth/login') || url.includes('/v1/auth/refresh');
    if (
      error.response?.status !== 401 ||
      !request ||
      isLoginOrRefresh ||
      !request._flowboardToken
    ) {
      return Promise.reject(new Error(errorMessage(error)));
    }
    if (request._flowboardSessionEpoch !== sessionEpoch)
      return Promise.reject(new Error('The signed-in user changed. Please retry your action.'));
    if (request._flowboardRetried) {
      expireSession();
      return Promise.reject(new Error(errorMessage(error)));
    }

    if (!activeAccessToken) {
      expireSession();
      return Promise.reject(new Error(errorMessage(error)));
    }

    request._flowboardRetried = true;
    try {
      if (request._flowboardToken !== activeAccessToken) {
        // Another request in this tab already refreshed the same session.
        return await apiClient.request(request);
      }
      await refreshWithLock(request._flowboardSessionEpoch);
      if (request._flowboardSessionEpoch !== sessionEpoch)
        throw new Error('The signed-in user changed. Please retry your action.');
      return await apiClient.request(request);
    } catch (refreshError) {
      return Promise.reject(
        refreshError instanceof Error ? refreshError : new Error(errorMessage(error)),
      );
    }
  },
);

async function api<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => (headers[key] = value));
  if (init.body) headers['Content-Type'] = 'application/json';
  // The interceptor replaces this captured token with the current in-memory
  // token after refresh, while preserving per-session retry boundaries.
  if (accessToken && !activeAccessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const response = await apiClient.request<T>({
      url: path,
      method: init.method ?? 'GET',
      headers,
      data: init.body,
    });
    return response.status === 204 ? (undefined as T) : response.data;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Something went wrong. Please try again.');
  }
}

export function login(loginIdentifier: string, password: string) {
  return api<AccessTokenResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginIdentifier, password }),
  });
}

export function refresh() {
  return refreshWithLock().then((accessToken) => ({ accessToken }));
}

export function getCurrentActor(accessToken: string) {
  return api<Actor>('/v1/me', {}, accessToken);
}

export async function logout(accessToken: string) {
  try {
    await api<void>('/v1/auth/logout', { method: 'POST' }, accessToken);
  } catch {
    /* Local state still must be cleared. */
  } finally {
    setAccessToken(undefined);
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
  const items: WorkspaceMember[] = [];
  let hasMore = true;
  while (hasMore) {
    const result = await api<{
      items: WorkspaceMember[];
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

export function moveTask(accessToken: string, id: string, body: unknown) {
  return api<TaskProjection>(
    `/v1/tasks/${id}/move`,
    { method: 'POST', body: JSON.stringify(body) },
    accessToken,
  );
}
export async function getResolvedConfig(accessToken: string, listId: string) {
  const [statuses, fields] = await Promise.all([
    api<{ statuses: BoardResponse['statuses']; source: BoardResponse['statusSource'] }>(
      `/v1/lists/${listId}/resolved-statuses`,
      {},
      accessToken,
    ),
    api<{ fields: BoardResponse['fields'] }>(
      `/v1/lists/${listId}/resolved-fields`,
      {},
      accessToken,
    ),
  ]);
  return { ...statuses, ...fields };
}

export type AdminContainer = Container & {
  visibility: 'public' | 'private';
  position: string | number;
};
export type LocalStatusSet = {
  local: { statuses: Array<{ key: string; name: string; category: string; color: string }> } | null;
  inherited: {
    statuses: Array<{ key: string; name: string; category: string; color: string }>;
    statusSource: { type: string; id: string };
  } | null;
};
export type LocalField = {
  id: string;
  key: string;
  name: string;
  type: string;
  required: boolean;
  options: Array<{ id: string; label: string; color: string }>;
};
export type Grant = { userId: string; mode: 'allow' | 'deny' };

export function getWorkspace(accessToken: string, id: string) {
  return api<{ id: string; name: string }>(`/v1/workspaces/${id}`, {}, accessToken);
}
export function renameWorkspace(accessToken: string, id: string, name: string) {
  return api<void>(
    `/v1/workspaces/${id}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
    accessToken,
  );
}
export function createContainer(accessToken: string, body: unknown) {
  return api<AdminContainer>(
    '/v1/containers',
    { method: 'POST', body: JSON.stringify(body) },
    accessToken,
  );
}
export function updateContainer(accessToken: string, id: string, body: unknown) {
  return api<AdminContainer>(
    `/v1/containers/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    accessToken,
  );
}
export function archiveContainer(accessToken: string, id: string) {
  return api<void>(`/v1/containers/${id}`, { method: 'DELETE' }, accessToken);
}
export function reorderContainers(accessToken: string, parentId: string | null, ids: string[]) {
  return api<void>(
    '/v1/containers/reorder',
    { method: 'POST', body: JSON.stringify({ parentId, ids }) },
    accessToken,
  );
}
export function getStatusSet(accessToken: string, workspaceId: string, ownerId: string | null) {
  const path = ownerId
    ? `/v1/containers/${ownerId}/status-set`
    : `/v1/workspaces/${workspaceId}/status-set`;
  return api<LocalStatusSet>(path, {}, accessToken);
}
export function putStatusSet(
  accessToken: string,
  workspaceId: string,
  ownerId: string | null,
  statuses: unknown[],
) {
  const path = ownerId
    ? `/v1/containers/${ownerId}/status-set`
    : `/v1/workspaces/${workspaceId}/status-set`;
  return api<void>(path, { method: 'PUT', body: JSON.stringify({ statuses }) }, accessToken);
}
export function resetStatusSet(accessToken: string, ownerId: string) {
  return api<void>(`/v1/containers/${ownerId}/status-set`, { method: 'DELETE' }, accessToken);
}
export async function getLocalFields(accessToken: string, ownerId: string) {
  const items: LocalField[] = [];
  let more = true;
  while (more) {
    const result = await api<{ items: LocalField[]; page: { hasMore: boolean } }>(
      `/v1/containers/${ownerId}/fields?offset=${items.length}&limit=100`,
      {},
      accessToken,
    );
    if (result.page.hasMore && !result.items.length)
      throw new Error('Field collection changed while loading.');
    items.push(...result.items);
    more = result.page.hasMore;
  }
  return items;
}
export function createField(accessToken: string, ownerId: string, body: unknown) {
  return api<LocalField>(
    `/v1/containers/${ownerId}/fields`,
    { method: 'POST', body: JSON.stringify(body) },
    accessToken,
  );
}
export function updateField(accessToken: string, id: string, body: unknown) {
  return api<LocalField>(
    `/v1/fields/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    accessToken,
  );
}
export function deleteField(accessToken: string, id: string) {
  return api<void>(`/v1/fields/${id}`, { method: 'DELETE' }, accessToken);
}
export function reorderFields(accessToken: string, ownerId: string, ids: string[]) {
  return api<void>(
    `/v1/containers/${ownerId}/fields/reorder`,
    { method: 'POST', body: JSON.stringify({ ids }) },
    accessToken,
  );
}
export function getGrants(accessToken: string, ownerId: string) {
  return api<{ items: Grant[] }>(`/v1/containers/${ownerId}/grants`, {}, accessToken);
}
export function putGrant(
  accessToken: string,
  ownerId: string,
  userId: string,
  mode: Grant['mode'],
) {
  return api<Grant>(
    `/v1/containers/${ownerId}/grants/${userId}`,
    { method: 'PUT', body: JSON.stringify({ mode }) },
    accessToken,
  );
}
export function deleteGrant(accessToken: string, ownerId: string, userId: string) {
  return api<void>(`/v1/containers/${ownerId}/grants/${userId}`, { method: 'DELETE' }, accessToken);
}
