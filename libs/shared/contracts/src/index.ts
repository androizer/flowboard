export type Actor = { userId: string; workspaceId: string; role: 'admin' | 'member' };
export type ErrorEnvelope = {
  error: { code: string; message: string; details?: Array<{ path: string; reason: string }> };
};
export type Page<T> = {
  items: T[];
  page: { offset: number; limit: number; total: number; hasMore: boolean };
};
export const API_VERSION = 'v1';
