import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
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
