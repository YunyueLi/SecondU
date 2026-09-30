import { useEffect, useState } from 'react';
import type { AgentProfile } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Plus } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field } from '../components';
import { write, messageOf } from '../api';
import { getLocale, t } from '../i18n';
import { AgentAvatar } from './AgentIdentity';
import { expertDraft, expertText, type ExpertRecommendation, type ExpertReason } from './expertTemplates';
import './expert-preview.css';

const reasonKind=(reason:ExpertReason)=>reason.kind==='goal'?t('当前目标','Active goal'):reason.kind==='fact'?t('已确认背景','Confirmed context'):t('个人介绍','Profile');

export function ExpertPreview({item,avatarStyle,onClose,onCreated}:{item:ExpertRecommendation;avatarStyle:AgentProfile['avatarStyle'];onClose:()=>void;onCreated:(agent:AgentProfile)=>Promise<void>}){
  const {template}=item;
  const [name,setName]=useState(expertText(template.name,getLocale()));
  const [focusId,setFocusId]=useState(item.focusId),[answer,setAnswer]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<AgentProfile>();
  const [reasonsOpen,setReasonsOpen]=useState(()=>window.matchMedia('(min-width: 761px)').matches);
  useEffect(()=>{const media=window.matchMedia('(min-width: 761px)');const update=()=>setReasonsOpen(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const focus=template.focuses.find(option=>option.id===focusId)||template.focuses[0];
  const draft=expertDraft(template,getLocale(),name,focusId,answer);
  async function add(){if(busy||!name.trim())return;setBusy(true);setError('');try{const agent=created||await write<AgentProfile>('/agents',draft);setCreated(agent);await onCreated(agent);}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
  return <Dialog title={t('添加专家','Add an expert')} className="expert-preview-dialog settings-type-scale" onClose={()=>{if(!busy)onClose();}}>
    <form className="expert-preview-form" onSubmit={event=>{event.preventDefault();void add();}}>
      <div className="expert-preview">
        <aside className="expert-preview-context" aria-label={t('专家介绍','About this expert')}>
          <div className="expert-preview-heading"><AgentAvatar agent={{id:`expert-${template.id}`,name,avatarStyle}} size={40}/><h3 className="settings-type-heading">{expertText(template.name,getLocale())}</h3></div>
          <p className="expert-preview-description settings-type-support">{expertText(template.description,getLocale())}</p>
          {!!item.reasons.length&&<details className="expert-context" open={reasonsOpen} onToggle={event=>setReasonsOpen(event.currentTarget.open)}>
            <summary>{t('推荐依据','Why this fits')}</summary>
            <div className="expert-context-reasons">{item.reasons.map(reason=><div key={`${reason.kind}-${reason.id}`}><span>{reasonKind(reason)}{reason.demo?t('（示例）',' (sample)'):''}</span><p>{reason.text}</p></div>)}</div>
          </details>}
        </aside>
        <section className="expert-adjustment" aria-label={t('为你调整','Make it yours')}>
          <h3 className="settings-type-heading">{t('为你调整','Make it yours')}</h3>
          <Field label={t('助理名称','Agent name')}><Input size="md" value={name} disabled={busy||!!created} onChange={event=>setName(event.target.value)} maxLength={200} aria-label={t('专家名称','Expert name')}/></Field>
          <Field label={t('工作重点','Working focus')} hint={expertText(focus.instruction,getLocale())}><Select size="md" aria-label={t('专家工作重点','Expert working focus')} value={focusId} disabled={busy||!!created} onChange={option=>setFocusId(option.value)} options={template.focuses.map(option=>({value:option.id,label:expertText(option.title,getLocale())}))}/></Field>
          <Field label={expertText(template.question,getLocale())} hint={t('选填，会保存在角色说明中。','Optional. Saved in the role instructions.')}><Textarea size="md" rows={2} value={answer} onChange={event=>setAnswer(event.target.value)} maxLength={600} disabled={busy||!!created} aria-label={t('个性化设置','Personalization')} placeholder={t('写下希望这位助理记住的工作偏好','Add a working preference for this agent')}/></Field>
          <details className="expert-saved-instructions"><summary>{t('角色说明','Role instructions')}</summary><p tabIndex={0} aria-label={t('完整角色说明','Full role instructions')}>{draft.instructions}</p></details>
        </section>
      </div>
      <footer className="expert-preview-footer">
        {!!error&&<div className="expert-preview-error" role="status"><ErrorNotice error={error}/>{created&&<p className="settings-type-support">{t('已添加，点击下方按钮打开。','Added. Use the button below to open it.')}</p>}</div>}
        <div className="expert-preview-actions"><Button color="secondary" variant="ghost" size="md" type="button" disabled={busy} onClick={onClose}>{t('取消','Cancel')}</Button><Button color="primary" size="md" type="submit" loading={busy} disabled={!name.trim()}><Plus/>{created?t('打开已添加的助理','Open added agent'):t('添加到我的 Agent','Add to my agents')}</Button></div>
      </footer>
    </form>
  </Dialog>;
}
