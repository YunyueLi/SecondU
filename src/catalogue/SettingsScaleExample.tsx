import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Field } from '../components';
import { t } from '../i18n';
import '../design-system/settings-type-scale.css';
import './settings-scale-example.css';

/** Uses the same type classes as Settings and Agent details. No persistence. */
export function SettingsScaleExample() {
  const [surface, setSurface] = useState('settings');
  const [name, setName] = useState(t('项目助理', 'Project assistant'));
  const [saved, setSaved] = useState(name);
  return <div className="catalogue-settings-example settings-type-scale">
    <SegmentedControl value={surface} onChange={setSurface} size="md" aria-label={t('比较配置页面', 'Compare configuration surfaces')}>
      <SegmentedControl.Option value="settings">{t('设置', 'Settings')}</SegmentedControl.Option>
      <SegmentedControl.Option value="agent">{t('Agent 详情', 'Agent details')}</SegmentedControl.Option>
    </SegmentedControl>
    <section className="catalogue-settings-surface" aria-label={t('配置文字规范示例', 'Configuration type specimen')}>
      <header><h3>{surface === 'settings' ? t('设置', 'Settings') : t('Agent 详情', 'Agent details')}</h3><span>17px</span></header>
      <div className="catalogue-settings-content">
        <h4 className="settings-type-heading">{t('基本信息', 'Basic information')} <small>18px</small></h4>
        <p>{t('正文和控件保持同一阅读尺度。', 'Body text and controls share the same reading scale.')} <small>14px</small></p>
        <Field label={t('名称', 'Name')} hint={t('字段说明使用次级文字，示例修改只留在本页。', 'Field guidance uses supporting text. Changes stay on this page.')}><Input size="md" value={name} onChange={event => setName(event.target.value)} /></Field>
        <p className="settings-type-support">{t('次级说明（13px）', 'Supporting text (13px)')}</p>
        <p className="settings-type-meta">{t('版本 1（12px）', 'Version 1 (12px)')}</p>
      </div>
      <footer><span className="settings-type-support" role="status">{name === saved ? t('示例已同步', 'Example up to date') : t('有未保存的修改', 'Unsaved changes')}</span><Button size="md" color="secondary" variant="ghost" disabled={name === saved} onClick={() => setName(saved)}>{t('取消修改', 'Discard')}</Button><Button size="md" color="primary" disabled={!name.trim() || name === saved} onClick={() => setSaved(name)}>{t('保存示例', 'Save example')}</Button></footer>
    </section>
  </div>;
}
