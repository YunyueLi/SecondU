export class APIError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const text = await response.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; }
  catch { throw new APIError('本机服务返回了无法读取的结果，请稍后重试。', response.status); }
  if (!response.ok) {
    const error = data as { error?: string; code?: string };
    throw new APIError(error?.error || `请求未完成（${response.status}）`, response.status, error?.code);
  }
  return data as T;
}
export const write = <T,>(path: string, body?: unknown, method = 'POST') => api<T>(path, { method, ...(['POST','PUT','PATCH'].includes(method.toUpperCase()) || body !== undefined ? { body: JSON.stringify(body ?? {}) } : {}) });
export const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。';
