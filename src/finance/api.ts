import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, spaceStorageKey } from '../space';
import type { FinanceState } from './types';

export const financeUrl = (path: string) => apiUrl(`/finance${path}`);

export async function financeRequest<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal): Promise<T> {
  const response = await fetch(financeUrl(path), {
    method, cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  let result: any;
  try { result = await response.json(); }
  catch { throw new Error('财务服务返回了无法读取的结果，请重试。'); }
  if (!response.ok) throw Object.assign(new Error(result.error?.message || result.message || (typeof result.error === 'string' ? result.error : '操作未完成，请重试。')), { status: response.status, code: result.error?.code || result.code });
  return result as T;
}

export function useFinance() {
  const [data, setData] = useState<FinanceState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const latest = useRef(0), alive = useRef(true);
  const refresh = useCallback(async (throwOnError = false) => {
    const request = ++latest.current;
    if (alive.current) setLoading(true);
    try {
      const state = await financeRequest<FinanceState>('/state');
      if (!Array.isArray(state.accounts) || !Array.isArray(state.liabilities)) throw new Error('账户数据尚未完整返回，请重试。');
      if (alive.current && request === latest.current) { setData(state); setError(''); }
      return state;
    } catch (failure) {
      if (alive.current && request === latest.current) setError(failure instanceof Error ? failure.message : '财务数据读取失败，请重试。');
      if (throwOnError) throw failure;
      return null;
    } finally { if (alive.current && request === latest.current) setLoading(false); }
  }, []);
  const applyState = useCallback((state: FinanceState) => {
    ++latest.current;
    if (alive.current) { setData(state); setError(''); setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const stream = new EventSource(financeUrl('/events'));
    const changed = () => { void refresh(); };
    const wake = () => { if (!document.hidden) void refresh(); };
    stream.addEventListener('state', changed);
    window.addEventListener('finance:changed', changed);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive.current = false; ++latest.current; stream.close();
      window.removeEventListener('finance:changed', changed);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [refresh]);
  return { data, error, loading, refresh, applyState };
}

export function useHiddenAmounts() {
  const key = spaceStorageKey('finance.hidden');
  const read = () => { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } };
  const [hidden, setHidden] = useState(read);
  useEffect(() => {
    const update = () => setHidden(read());
    window.addEventListener('finance:visibility', update);
    return () => window.removeEventListener('finance:visibility', update);
  }, [key]);
  const change = (value: boolean) => {
    setHidden(value);
    try { sessionStorage.setItem(key, value ? '1' : '0'); } catch { /* Visibility remains usable for this view. */ }
    window.dispatchEvent(new Event('finance:visibility'));
  };
  return [hidden, change] as const;
}
