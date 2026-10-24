import { useCallback, useEffect, useRef, useState } from 'react';
import {spaceStorageKey} from '../../../src/space';
import {api, APIError} from './api';
import {t,useLocale} from '../../../src/i18n';
import {sessionStorage} from './storage';
import {financeExampleResponse} from './finance-runtime.mjs';
import type { FinanceState } from '../../../src/finance/types';

export const financeUrl = (_path: string) => 'about:blank';
const unavailable = () => new APIError(t('这是只读虚构财务示例。添加记录、连接账户和更新行情，请使用桌面版。', 'This is a read-only fictional finance example. Use the desktop app to add records, connect accounts or update quotes.'), 403, 'showcase_read_only');
export async function financeFetch(_url: string, _init?: RequestInit): Promise<Response> { throw unavailable(); }
export async function financeRequest<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (method === 'GET') return api<T>(`/finance${path}`, {signal});
  const state = await api<any>('/finance/state', {signal});
  const result = financeExampleResponse(state, path, body, method);
  if (result !== undefined) return structuredClone(result) as T;
  throw unavailable();
}

export function useFinance() {
  const locale = useLocale();
  const [data, setData] = useState<FinanceState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const latest = useRef(0), alive = useRef(true);
  const refresh = useCallback(async (throwOnError = false) => {
    const request = ++latest.current;
    if (alive.current) setLoading(true);
    try {
      const state = await financeRequest<FinanceState>('/state');
      if (!Array.isArray(state.accounts) || !Array.isArray(state.liabilities)) throw new Error(t('账户数据尚未完整返回，请重试。', 'Account data is incomplete. Please try again.'));
      if (alive.current && request === latest.current) { setData(state); setError(''); }
      return state;
    } catch (failure) {
      if (alive.current && request === latest.current) setError(failure instanceof Error ? failure.message : t('财务数据读取失败，请重试。', 'Unable to load finance data. Please try again.'));
      if (throwOnError) throw failure;
      return null;
    } finally { if (alive.current && request === latest.current) setLoading(false); }
  }, [locale]);
  const applyState = useCallback((state: FinanceState) => {
    ++latest.current;
    if (alive.current) { setData(state); setError(''); setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const changed = () => { void refresh(); };
    const wake = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('finance:changed', changed);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive.current = false; ++latest.current;
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
