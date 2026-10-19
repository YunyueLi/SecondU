import {useCallback, useEffect, useRef, useState} from 'react';
import type {Bootstrap} from '../../shared/contracts';
import {api, messageOf} from '../api';
import {currentSpace, PERSONAL_SPACE} from '../space';
import {createStartupRequest, StartupTimeoutError} from '../startupRequest';
import {t} from '../i18n';

export function useMobileWorkspace() {
  const [data, setData] = useState<Bootstrap>();
  const [connection, setConnection] = useState<'connecting'|'connected'|'offline'>('connecting');
  const [error, setError] = useState('');
  const [lastConnectedAt, setLastConnectedAt] = useState<string>();
  const mounted = useRef(false), sequence = useRef(0), prepared = useRef(false);
  const request = useRef<ReturnType<typeof createStartupRequest<Bootstrap>>>(undefined);
  const inFlight = useRef<Promise<void>>(undefined);
  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const version = ++sequence.current;
    const pending = createStartupRequest(async signal => {
      if (!prepared.current && currentSpace() === PERSONAL_SPACE) {
        await api('/spaces/' + PERSONAL_SPACE, {method:'POST', body:'{}', signal}, true);
        prepared.current = true;
      }
      return api<Bootstrap>('/bootstrap', {signal});
    });
    request.current = pending;
    const promise = pending.promise.then(value => {
      if (!mounted.current || version !== sequence.current) return;
      setData(value); setConnection('connected'); setError(''); setLastConnectedAt(new Date().toISOString());
    }).catch(cause => {
      if (!mounted.current || version !== sequence.current) return;
      const text = cause instanceof StartupTimeoutError
        ? t('连接响应超时。确认电脑仍在运行后重试。', 'The connection timed out. Check that your computer is running, then retry.')
        : messageOf(cause);
      setConnection('offline'); setError(text);
      throw cause;
    }).finally(() => { if (inFlight.current === promise) inFlight.current = undefined; });
    inFlight.current = promise;
    return promise;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh().catch(() => {});
    const reconnect = () => { if (!document.hidden) void refresh().catch(() => {}); };
    const offline = () => {setConnection('offline'); setError(t('网络已断开。已读取的内容仍可查看，重新连接后再发送。', 'You are offline. You can read loaded content and send after reconnecting.'));};
    window.addEventListener('online', reconnect); window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', reconnect);
    return () => {
      mounted.current = false; ++sequence.current; request.current?.abort(); inFlight.current = undefined;
      window.removeEventListener('online', reconnect); window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', reconnect);
    };
  }, [refresh]);
  const active = data?.tasks.some(task => ['running','awaiting_approval'].includes(task.status));
  useEffect(() => {
    const timer = setInterval(() => {if (!document.hidden && navigator.onLine) void refresh().catch(() => {});}, active ? 2500 : 10000);
    return () => clearInterval(timer);
  }, [active, refresh]);
  return {data, connection, error, lastConnectedAt, refresh};
}
