import { useEffect, useSyncExternalStore } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Warning } from '@openai/apps-sdk-ui/components/Icon';
import { api, messageOf } from './api';
import { apiUrl, spaceStorageKey } from './space';
import { createNavigationPreferencesClient, readLegacyNavigationPreferences, type NavigationPreferences, type NavigationPreferencesClient } from './optional-navigation-model.mjs';
import { t } from './i18n';
import './optional-modules-navigation.css';

const clients = new Map<string, NavigationPreferencesClient>();
export function useNavigationPreferences() {
  const endpoint = apiUrl('/settings/navigation');
  let client = clients.get(endpoint);
  if (!client) {
    const key = spaceStorageKey('hither.optionalModules.pinned.v1');
    const path = endpoint.slice('/api'.length);
    client = createNavigationPreferencesClient({
      read: () => api<NavigationPreferences | null>(path, {}, true),
      write: body => api<NavigationPreferences>(path, { method: 'PUT', body: JSON.stringify(body) }, true),
      readLegacy: () => readLegacyNavigationPreferences(localStorage, key),
    });
    clients.set(endpoint, client);
  }
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    const refresh = () => { void client.refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [client]);
  return { ...state, client };
}

export function NavigationPreferenceStatus({ state, rail=false }: { state: ReturnType<typeof useNavigationPreferences>; rail?:boolean }) {
  if (!state.error) return null;
  const label=state.errorOperation==='save'?t('侧栏设置未保存','Sidebar changes not saved'):t('侧栏设置暂不可用','Sidebar settings unavailable');
  return <div className={`navigation-preference-status${rail?' is-rail':''}`}>
    <span className="navigation-preference-announcement" role="status">{label}</span>
    <Popover><Popover.Trigger><Button color="secondary" variant="ghost" size="sm" className="navigation-preference-status-trigger" aria-label={label} title={rail?label:undefined}><Warning/>{!rail&&<span>{label}</span>}</Button></Popover.Trigger>
      <Popover.Content side={rail?'right':'top'} align="start" width={288} minWidth="auto" className="navigation-preference-status-popover">
        <p>{messageOf(state.error)}</p>
        <Button color="secondary" variant="outline" size="sm" disabled={state.busy} onClick={() => { void state.client.refresh(); }}>{t('重新读取', 'Reload settings')}</Button>
      </Popover.Content>
    </Popover>
  </div>;
}
