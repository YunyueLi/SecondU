import { useUnsavedChanges } from '../useUnsavedChanges';
import { t } from '../i18n';
import { useEffect, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { ThumbUp, ThumbUpFilled, ThumbDown, ThumbDownFilled, DotsHorizontalMoreMenu, Download, Edit, Chat, Brain } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, ErrorNotice, Field, RichText } from '../components';
import { write, messageOf } from '../api';
import type { Artifact, Fact, FactKind, PreferenceDomain, Task, TaskFeedbackRecord, TaskMessage, TaskReaction } from '../../shared/contracts';
import './reply-feedback.css';

export function FeedbackAction({task,messageId,artifacts=[],onRefresh,onRevise}:{task:Task;messageId:string;artifacts?:Artifact[];onRefresh:()=>Promise<void>;onRevise?:()=>void}) {
  const message=task.messages.find(message=>message.id===messageId&&message.role==='assistant');
  const [learningOpen,setLearningOpen]=useState(false),[reasonOpen,setReasonOpen]=useState(false);
  const [reaction,setReaction]=useState(message?.reaction),[reason,setReason]=useState<TaskReaction['reason']>(message?.reaction?.reason),[comment,setComment]=useState(message?.reaction?.comment??'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [reasonBaseline,setReasonBaseline]=useState(()=>JSON.stringify([reason,comment]));
  useUnsavedChanges({unsaved:reasonOpen&&JSON.stringify([reason,comment])!==reasonBaseline,busy});
  useEffect(()=>{setReaction(message?.reaction);},[message?.reaction?.value,message?.reaction?.reason,message?.reaction?.comment,message?.reaction?.updatedAt]);
  if(!message)return null;
  const active=['queued','running','awaiting_approval'].includes(task.status);
  const save=async(value:TaskReaction['value']|null,detail?:{reason?:TaskReaction['reason'];comment:string})=>{
    setBusy(true);setError('');
    try{const result=await write<TaskMessage>(`/tasks/${task.id}/reaction`,{messageId,value,...detail},'PUT');setReaction(result.reaction);if(detail)setReasonBaseline(JSON.stringify([detail.reason,detail.comment]));await onRefresh();return true;}
    catch(err){setError(messageOf(err));return false;}finally{setBusy(false);}
  };
  const openReason=()=>{setReasonBaseline(JSON.stringify([reaction?.reason,reaction?.comment??'']));setReason(reaction?.reason);setComment(reaction?.comment??'');setError('');setReasonOpen(true);};
  const down=async()=>{if(reaction?.value==='down'){await save(null);return;}if(await save('down')){setReasonBaseline(JSON.stringify([undefined,'']));setReason(undefined);setComment('');setReasonOpen(true);}};
  const exportReply=()=>{
    const blob=new Blob([message.content],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`${task.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,80)||'SecondU'}-${messageId.slice(-8)}.txt`;
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const upLabel=reaction?.value==='up'?t('已标记为有帮助，点击撤销','Marked helpful. Click to undo'):t('有帮助','Helpful');
  const downLabel=reaction?.value==='down'?t('已标记为没有帮助，点击撤销','Marked unhelpful. Click to undo'):t('没有帮助','Not helpful');
  const reasons:Array<{value:NonNullable<TaskReaction['reason']>;label:string}>=[{value:'not_helpful',label:t('帮助不大','Not useful')},{value:'inaccurate',label:t('事实有误','Inaccurate')},{value:'instructions',label:t('未遵守要求','Missed instructions')},{value:'personal_context',label:t('个人背景用错','Wrong personal context')},{value:'other',label:t('其他','Other')}];
  return <><Button color="secondary" variant="ghost" uniform size="sm" disabled={active||busy} aria-pressed={reaction?.value==='up'} onClick={()=>void save(reaction?.value==='up'?null:'up')} aria-label={upLabel} title={upLabel}>{reaction?.value==='up'?<ThumbUpFilled/>:<ThumbUp/>}</Button>
    <Button color="secondary" variant="ghost" uniform size="sm" disabled={active||busy} aria-pressed={reaction?.value==='down'} onClick={()=>void down()} aria-label={downLabel} title={downLabel}>{reaction?.value==='down'?<ThumbDownFilled/>:<ThumbDown/>}</Button>
    <Menu><Menu.Trigger><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('更多答复操作','More reply actions')} title={t('更多','More')}><DotsHorizontalMoreMenu/></Button></Menu.Trigger><Menu.Content align="start" minWidth={210}>
      {onRevise&&<Menu.Item disabled={active||busy} onSelect={onRevise}><Edit/>{t('继续修改','Revise this reply')}</Menu.Item>}
      <Menu.Item onSelect={exportReply}><Download/>{t('导出这条答复','Export this reply')}</Menu.Item>
      <Menu.Separator/>
      <Menu.Item disabled={active||busy} onSelect={openReason}><Chat/>{t('补充反馈','Add feedback')}</Menu.Item>
      <Menu.Item disabled={active||busy} onSelect={()=>setLearningOpen(true)}><Brain/>{t('纠正个人理解','Correct a personal insight')}</Menu.Item>
    </Menu.Content></Menu>
    {error&&!reasonOpen&&<span className="reply-feedback-error" role="alert">{error}</span>}
    {reasonOpen&&<Dialog title={t('这条答复哪里需要改进？','What could be better?')} className="reply-feedback-dialog" onClose={()=>{if(!busy)setReasonOpen(false);}}><form onSubmit={event=>{event.preventDefault();if(!busy)void save('down',{...(reason?{reason}:{}),comment}).then(saved=>{if(saved)setReasonOpen(false);});}}>
      <div className="reply-feedback-reasons" role="group" aria-label={t('反馈原因','Feedback reason')}>{reasons.map(option=><Button key={option.value} color="secondary" variant={reason===option.value?'soft':'outline'} size="sm" type="button" aria-pressed={reason===option.value} disabled={busy} onClick={()=>setReason(reason===option.value?undefined:option.value)}>{option.label}</Button>)}</div>
      <Textarea aria-label={t('补充反馈（可选）','Additional feedback (optional)')} placeholder={t('补充说明（可选）','Add details (optional)')} rows={3} maxLength={5000} value={comment} disabled={busy} onChange={event=>setComment(event.target.value)}/>
      <ErrorNotice error={error}/><footer><Button color="secondary" variant="ghost" type="button" onClick={()=>setReasonOpen(false)} disabled={busy}>{t('关闭','Close')}</Button><Button color="primary" type="submit" loading={busy}>{t('保存反馈','Save feedback')}</Button></footer>
    </form></Dialog>}
    {learningOpen&&<TaskFeedback task={task} messageId={messageId} artifacts={artifacts} onRefresh={onRefresh} onClose={()=>setLearningOpen(false)}/>}</>;
}

export function TaskFeedback({task,messageId,artifacts=[],feedback='',onRefresh,onClose}:{task:Task;messageId?:string;artifacts?:Artifact[];feedback?:string;onRefresh:()=>Promise<void>;onClose:()=>void}) {
  const original=task.messages.find(message=>message.id===messageId)??task.messages.filter(message=>message.role==='assistant').at(-1);
  const availableArtifacts=artifacts.filter(artifact=>artifact.taskId===task.id);
  const [requestId]=useState(()=>crypto.randomUUID());
  const [correction,setCorrection]=useState(feedback),[statement,setStatement]=useState(''),[kind,setKind]=useState<FactKind>('preference'),[preferenceDomain,setPreferenceDomain]=useState<PreferenceDomain>('general');
  const [scope,setScope]=useState('related'),[artifactKey,setArtifactKey]=useState('none'),[adopted,setAdopted]=useState(''),[adoptionConfirmed,setAdoptionConfirmed]=useState(false),[outcome,setOutcome]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<TaskFeedbackRecord>(),[confirmed,setConfirmed]=useState(false);
  const snapshot=JSON.stringify([correction,statement,kind,preferenceDomain,scope,artifactKey,adopted,adoptionConfirmed,outcome]);
  const [baseline]=useState(snapshot);
  useUnsavedChanges({unsaved:!saved&&snapshot!==baseline,busy});
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
      <Field label={t('这次需要纠正什么','What should change?')}><Textarea disabled={busy} aria-label={t('用户反馈原文','Your feedback')} required rows={3} value={correction} onChange={event=>setCorrection(event.target.value)}/></Field>
      <Field label={t('以后应该记住什么','What should be remembered?')} hint={t('只保留你希望用于以后任务的理解，保存后再由你确认。','Keep only what should inform future tasks. You can confirm it after saving.')}><Textarea disabled={busy} aria-label={t('从任务中学到的理解','Insight from this task')} required rows={3} value={statement} onChange={event=>setStatement(event.target.value)}/></Field>
      <Field label={t('适用范围','Applies to')}><Select disabled={busy} value={scope} options={[{value:'related',label:t('同类任务','Related tasks')},...(task.projectId?[{value:'project',label:t('当前项目','This project')}]:[]),{value:'all',label:t('所有任务','All tasks')}]} onChange={option=>setScope(option.value)}/></Field>
      <details><summary>{t('补充类型、产物与实际结果','Type, artifact, and outcome')}</summary><div className="cog-stack">
        <Field label={t('理解类型','Insight type')}><Select disabled={busy} value={kind} options={[{value:'preference',label:t('偏好','Preference')},{value:'constraint',label:t('约束','Constraint')},{value:'decision',label:t('决定','Decision')},{value:'value',label:t('价值取向','Value')}]} onChange={option=>setKind(option.value as FactKind)}/></Field>
        {kind==='preference'&&<Field label={t('偏好分类','Preference category')}><Select disabled={busy} value={preferenceDomain} options={[{value:'general',label:t('通用','General')},{value:'work',label:t('工作习惯','Work')},{value:'taste',label:t('兴趣喜好','Taste')}]} onChange={option=>setPreferenceDomain(option.value as PreferenceDomain)}/></Field>}
        {revisions.length>0&&<Field label={t('关联原产物版本','Original artifact version')}><Select disabled={busy} value={artifactKey} options={[{value:'none',label:t('仅关联这条答复','This reply only')},...revisions.map(({value,label})=>({value,label}))]} onChange={option=>setArtifactKey(option.value)}/></Field>}
        <Field label={t('我最终采用的内容（可选）','Content I adopted (optional)')}><Textarea disabled={busy} aria-label={t('最终采用的内容','Adopted content')} rows={3} value={adopted} onChange={event=>setAdopted(event.target.value)}/></Field>
        {adopted.trim()&&<label><input disabled={busy} type="checkbox" checked={adoptionConfirmed} onChange={event=>setAdoptionConfirmed(event.target.checked)}/> {t('确认这是我实际采用的内容','I confirm that I adopted this content')}</label>}
        <Field label={t('实际发生的结果（可选）','Actual outcome (optional)')} hint={t('作为你的结果记录保存，不自动视为系统核实。','Saved as your reported outcome.')}><Textarea disabled={busy} aria-label={t('实际结果','Actual outcome')} rows={2} value={outcome} onChange={event=>setOutcome(event.target.value)}/></Field>
      </div></details>
      <ErrorNotice error={error}/><div className="record-actions"><Button color="secondary" variant="ghost" type="button" onClick={onClose} disabled={busy}>{t('取消','Cancel')}</Button><Button color="primary" type="submit" loading={busy} disabled={busy||!!adopted.trim()&&!adoptionConfirmed}>{t('保存为待确认','Save for review')}</Button></div>
    </form>}
  </Dialog>;
}
