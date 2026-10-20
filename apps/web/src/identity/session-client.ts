export type Actor = { userId: string; workspaceId: string; role: 'admin' | 'member' };

type AccessTokenResponse = { accessToken: string };
type ApiError = { message: string };

async function api<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as Partial<ApiError>;
    throw new Error(payload.message ?? 'Something went wrong. Please try again.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function login(loginIdentifier: string, password: string) {
  return api<AccessTokenResponse>('/v1/auth/login', { method: 'POST', body: JSON.stringify({ loginIdentifier, password }) });
}

export function refresh() {
  return api<AccessTokenResponse>('/v1/auth/refresh', { method: 'POST' });
}

export function getCurrentActor(accessToken: string) {
  return api<Actor>('/v1/me', {}, accessToken);
}

export async function logout(accessToken: string) {
  try { await api<void>('/v1/auth/logout', { method: 'POST' }, accessToken); } catch { /* Local state still must be cleared. */ }
}

export type Container = { id: string; name: string; type: 'space' | 'folder' | 'list'; parentContainerId: string | null };

export function getTree(accessToken: string) {
  return api<{ workspaceId: string; items: Container[] }>('/v1/tree', {}, accessToken);
}
