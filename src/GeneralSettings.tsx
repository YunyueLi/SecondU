import { Check } from '@openai/apps-sdk-ui/components/Icon';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import type { Appearance, AppearanceStatus } from './appearance';
import { compactSelectProps } from './compactSelect';
import { t } from './i18n';
import {useState} from 'react';
import type {ApprovalMode,Bootstrap} from '../shared/contracts';
import {approvalOptions} from './composer/ExecutionControls';
import {write,messageOf} from './api';
import { UpdateSettings } from './UpdateSettings';
import { useUnsavedChanges } from './useUnsavedChanges';

export function GeneralSettings({ value, status, onChange, data, onRefresh }: { value: Appearance; status: AppearanceStatus; onChange: (update: Partial<Appearance>) => void;data:Bootstrap;onRefresh:()=>Promise<void> }) {
  const [executionSaving,setExecutionSaving]=useState(false),[executionError,setExecutionError]=useState('');
  useUnsavedChanges({ unsaved: false, busy: executionSaving });
  const options=approvalOptions();
  const approvalMode=data.executionSettings?.approvalMode||'ask';
  async function changeApproval(value:ApprovalMode){setExecutionSaving(true);setExecutionError('');try{await write('/settings/execution',{approvalMode:value},'PUT');await onRefresh();}catch(error){setExecutionError(messageOf(error));}finally{setExecutionSaving(false);}}
  return <>
    <header className="settings-panel-heading"><h2 id="settings-general-title">{t('通用', 'General')}</h2></header>
    <div className="preferences-group general-preferences">
      <div className="preference-line">
        <div><h3><label htmlFor="settings-language">{t('界面语言', 'Language')}</label></h3><p>{t('个人资料与对话保留原文', 'Your data and conversations stay as written')}</p></div>
        <Select {...compactSelectProps} id="settings-language" value={value.language} onChange={option => onChange({ language: option.value as Appearance['language'] })} options={[{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }]} />
      </div>
      <div className="preference-line">
        <div><h3><label htmlFor="settings-send-key">{t('发送消息', 'Send messages')}</label></h3><p>{t('Shift + Enter 始终换行', 'Shift + Enter always adds a new line')}</p></div>
        <Select {...compactSelectProps} id="settings-send-key" value={value.sendKey} onChange={option => onChange({ sendKey: option.value as Appearance['sendKey'] })} options={[{ value: 'enter', label: 'Enter' }, { value: 'modifier', label: '⌘ / Ctrl + Enter' }]} />
      </div>
      <div className="preference-line">
        <div><h3><label htmlFor="settings-approval-mode">{t('默认操作权限','Default permissions')}</label></h3><p>{options.find(option=>option.value===approvalMode)?.description}</p></div>
        <Select {...compactSelectProps} id="settings-approval-mode" value={approvalMode} disabled={executionSaving} onChange={option=>{void changeApproval(option.value as ApprovalMode);}} options={options.map(({value,label})=>({value,label}))}/>
      </div>
    </div>
    {executionError&&<p role="alert" className="artwork-error">{executionError}</p>}
    <p className="general-save-status settings-save-status" role="status">{status.error ? t('保存未完成', 'Not saved') : status.saving ? t('正在保存', 'Saving') : <><Check />{t('已保存', 'Saved')}</>}</p>
    {status.error && <p role="alert" className="artwork-error">{status.error}</p>}
    <UpdateSettings />
  </>;
}
