import { useEffect, useState } from 'react';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import type { Bootstrap } from '../shared/contracts';
import type { TwinProactiveSettings } from '../shared/twin-building';
import { loadProactiveSettings, saveProactiveSettings, messageOf } from './api';
import { t } from './i18n';

export function ProactiveContactSetting({ data, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> }) {
  const [setting, setSetting] = useState<TwinProactiveSettings | null>(data.twinBuilding?.proactive ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const readonly = data.executionPolicy === 'showcase';

  useEffect(() => {
    if (data.twinBuilding?.proactive) setSetting(data.twinBuilding.proactive);
  }, [data.twinBuilding?.proactive]);

  useEffect(() => {
    if (setting) return;
    let alive = true;
    loadProactiveSettings().then(value => { if (alive) setSetting(value); }).catch(reason => { if (alive) setError(messageOf(reason)); });
    return () => { alive = false; };
  }, [setting]);

  async function change(enabled: boolean) {
    if (!setting || busy || readonly) return;
    setBusy(true); setError('');
    try {
      setSetting(await saveProactiveSettings(enabled, setting.revision));
      await onRefresh();
    } catch (reason) {
      setError(messageOf(reason));
      try { setSetting(await loadProactiveSettings()); } catch { /* Preserve the visible error and last confirmed value. */ }
    } finally { setBusy(false); }
  }

  return <>
    <div className="preference-line settings-toggle-preference">
      <div><h3>{t('允许分身主动联系我', 'Let my twin contact me')}</h3><p>{t('新资料与正在关注的目标或任务有关时，在对话中提醒我。', 'Send a message when new information relates to my goals or tasks.')}</p></div>
      <Switch aria-label={t('允许分身主动联系我', 'Let my twin contact me')} checked={setting?.enabled ?? false} disabled={busy || !setting || readonly} onCheckedChange={enabled => { void change(enabled); }} />
    </div>
    {readonly && <p className="settings-data-note">{t('可在自己的个人空间中开启。', 'Available in your personal workspace.')}</p>}
    {error && <div role="alert" className="artwork-error"><p>{error}</p><Button size="sm" color="secondary" variant="ghost" disabled={busy} onClick={() => { setError(''); setSetting(null); }}>{t('重新读取', 'Reload')}</Button></div>}
  </>;
}
