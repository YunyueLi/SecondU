import { t } from '../i18n';
import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Dialog, ErrorNotice, Field, RichText } from '../components';
import { write, messageOf } from '../api';
import type { Artifact, Fact, FactKind, PreferenceDomain, Task, TaskFeedbackRecord } from '../../shared/contracts';

export function FeedbackAction({task,messageId,artifacts=[],onRefresh}:{task:Task;messageId:string;artifacts?:Artifact[];onRefresh:()=>Promise<void>}) {
  const [open,setOpen]=useState(false);
  if(!task.messages.some(message=>message.id===messageId&&message.role==='assistant'))return null;
  const active=['queued','running','awaiting_approval'].includes(task.status);
  return <><Button color="secondary" variant="ghost" size="sm" disabled={active} onClick={()=>setOpen(true)} aria-label={t('记录这条答复的反馈','Save feedback on this reply')}>{t('反馈','Feedback')}</Button>{open&&<TaskFeedback task={task} messageId={messageId} artifacts={artifacts} onRefresh={onRefresh} onClose={()=>setOpen(false)}/>}</>;
}

export function TaskFeedback({task,messageId,artifacts=[],feedback='',onRefresh,onClose}:{task:Task;messageId?:string;artifacts?:Artifact[];feedback?:string;onRefresh:()=>Promise<void>;onClose:()=>void}) {
  const original=task.messages.find(message=>message.id===messageId)??task.messages.filter(message=>message.role==='assistant').at(-1);
  const availableArtifacts=artifacts.filter(artifact=>artifact.taskId===task.id);
  const [requestId]=useState(()=>crypto.randomUUID());
  const [correction,setCorrection]=useState(feedback),[statement,setStatement]=useState(''),[kind,setKind]=useState<FactKind>('preference'),[preferenceDomain,setPreferenceDomain]=useState<PreferenceDomain>('general');
  const [scope,setScope]=useState('related'),[artifactKey,setArtifactKey]=useState('none'),[adopted,setAdopted]=useState(''),[adoptionConfirmed,setAdoptionConfirmed]=useState(false),[outcome,setOutcome]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<TaskFeedbackRecord>(),[confirmed,setConfirmed]=useState(false);
  const revisions=availableArtifacts.flatMap(artifact=>artifact.versions.map(revision=>({value:`${artifact.id}:${revision.version}`,label:`${artifact.name}（v${revision.version}）`,artifact,revision})));
  const selected=revisions.find(revision=>revision.value===artifactKey);
  const save=async()=>{setBusy(true);setError('');try {
    const result=await write<TaskFeedbackRecord>(`/tasks/${task.id}/feedback`,{requestId,messageId:original?.id,feedback:correction,statement,kind,...(kind==='preference'?{preferenceDomain}:{}),...(scope==='all'?{scope:{domain:'any'}}:scope==='project'?{scope:{domain:'project',projectId:task.projectId}}:{}),...(selected?{artifact:{id:selected.artifact.id,version:selected.revision.version}}:{}),...(adopted.trim()?{adoption:{text:adopted,confirmed:adoptionConfirmed}}:{}),...(outcome.trim()?{outcome:{text:outcome}}:{})});
    setSaved(result);await onRefresh();
  }catch(err){setError(messageOf(err));}finally{setBusy(false);}};
  const confirm=async()=>{if(!saved?.factVersion)return;setBusy(true);setError('');try {await write<Fact>(`/facts/${saved.factId}`,{baseVersion:saved.factVersion,status:'confirmed',reason:'用户在任务反馈中明确确认用于以后任务。'},'PUT');setConfirmed(true);await onRefresh();}catch(err){setError(messageOf(err));}finally{setBusy(false);}};
  return <Dialog title={t('记录反馈','Save feedback')} onClose={()=>{if(!busy)onClose();}} className="record-dialog">
    {saved?<div className="cog-stack record-form"><p role="status">{confirmed?t('已确认。开启数字分身后，相关的新任务会读取这条理解。','Confirmed. Relevant future tasks can use this insight when digital twin mode is on.'):t('已保存为待确认的理解。原答复、所选产物版本和当时上下文已一并留存。','Saved for review with the original reply, selected artifact version, and recorded task context.')}</p><blockquote>{saved.correction.statement}</blockquote><p className="cog-muted">{scope==='all'?t('适用于所有任务。','Applies to all tasks.'):scope==='project'?t('仅用于当前项目。','Applies to this project only.'):t('仅在相关范围和同类用途的任务中使用。','Applies within the related context and purpose.')}</p><ErrorNotice error={error}/><div className="record-actions"><Button color="secondary" variant="ghost" onClick={onClose} disabled={busy}>{t('关闭','Close')}</Button>{!confirmed&&<Button color="primary" onClick={()=>void confirm()} loading={busy}>{t('确认并用于以后任务','Confirm for future tasks')}</Button>}</div></div>:<form className="cog-stack record-form" onSubmit={event=>{event.preventDefault();if(!busy)void save();}}>
      <details><summary>{t('查看原答复','View original reply')}</summary><RichText>{original?.content??t('未选择答复','No reply selected')}</RichText></details>
      <Field label={t('这次需要纠正什么','What should change?')}><Textarea aria-label={t('用户反馈原文','Your feedback')} required rows={3} value={correction} onChange={event=>setCorrection(event.target.value)}/></Field>
      <Field label={t('以后应该记住什么','What should be remembered?')} hint={t('只保留你希望用于以后任务的理解，保存后再由你确认。','Keep only what should inform future tasks. You can confirm it after saving.')}><Textarea aria-label={t('从任务中学到的理解','Insight from this task')} required rows={3} value={statement} onChange={event=>setStatement(event.target.value)}/></Field>
      <Field label={t('适用范围','Applies to')}><Select value={scope} options={[{value:'related',label:t('同类任务','Related tasks')},...(task.projectId?[{value:'project',label:t('当前项目','This project')}]:[]),{value:'all',label:t('所有任务','All tasks')}]} onChange={option=>setScope(option.value)}/></Field>
      <details><summary>{t('补充类型、产物与实际结果','Type, artifact, and outcome')}</summary><div className="cog-stack">
        <Field label={t('理解类型','Insight type')}><Select value={kind} options={[{value:'preference',label:t('偏好','Preference')},{value:'constraint',label:t('约束','Constraint')},{value:'decision',label:t('决定','Decision')},{value:'value',label:t('价值取向','Value')}]} onChange={option=>setKind(option.value as FactKind)}/></Field>
        {kind==='preference'&&<Field label={t('偏好分类','Preference category')}><Select value={preferenceDomain} options={[{value:'general',label:t('通用','General')},{value:'work',label:t('工作习惯','Work')},{value:'taste',label:t('兴趣喜好','Taste')}]} onChange={option=>setPreferenceDomain(option.value as PreferenceDomain)}/></Field>}
        {revisions.length>0&&<Field label={t('关联原产物版本','Original artifact version')}><Select value={artifactKey} options={[{value:'none',label:t('仅关联这条答复','This reply only')},...revisions.map(({value,label})=>({value,label}))]} onChange={option=>setArtifactKey(option.value)}/></Field>}
        <Field label={t('我最终采用的内容（可选）','Content I adopted (optional)')}><Textarea aria-label={t('最终采用的内容','Adopted content')} rows={3} value={adopted} onChange={event=>setAdopted(event.target.value)}/></Field>
        {adopted.trim()&&<label><input type="checkbox" checked={adoptionConfirmed} onChange={event=>setAdoptionConfirmed(event.target.checked)}/> {t('确认这是我实际采用的内容','I confirm that I adopted this content')}</label>}
        <Field label={t('实际发生的结果（可选）','Actual outcome (optional)')} hint={t('作为你的结果记录保存，不自动视为系统核实。','Saved as your reported outcome.')}><Textarea aria-label={t('实际结果','Actual outcome')} rows={2} value={outcome} onChange={event=>setOutcome(event.target.value)}/></Field>
      </div></details>
      <ErrorNotice error={error}/><div className="record-actions"><Button color="secondary" variant="ghost" type="button" onClick={onClose} disabled={busy}>{t('取消','Cancel')}</Button><Button color="primary" type="submit" loading={busy} disabled={!!adopted.trim()&&!adoptionConfirmed}>{t('保存为待确认','Save for review')}</Button></div>
    </form>}
  </Dialog>;
}
