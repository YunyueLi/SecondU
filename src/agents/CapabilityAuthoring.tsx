import {useEffect,useState} from 'react';
import type {Bootstrap,Task} from '../../shared/contracts';
import type {CapabilityPreview} from '../../shared/capabilities';
import {Button,ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Plus,ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,Field,ErrorNotice} from '../components';
import {ConnectionSelect} from '../models/ConnectionSelect';
import {PackageImport} from './CapabilityManager';
import {api,write,messageOf} from '../api';
import {t} from '../i18n';
import './capabilities.css';

type DraftRecord={taskId:string;title:string;status:string;draft?:{name:string;summary:string;digest:string;versions:number;updatedAt:string}};
export function CapabilityAuthoring({data,onRefresh,base}:{data:Bootstrap;onRefresh:()=>Promise<void>;base?:{kind:'expert'|'team';id:string}}){
 const [open,setOpen]=useState(false),[kind,setKind]=useState<'expert'|'team'|'skill'>(base?.kind??'expert'),[prompt,setPrompt]=useState(''),[connectionId,setConnectionId]=useState(data.defaultConnectionId??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[drafts,setDrafts]=useState<DraftRecord[]>([]);
 useEffect(()=>{if(!open)return;let alive=true;api<DraftRecord[]>('/capabilities/drafts').then(value=>{if(alive)setDrafts(value);}).catch(err=>{if(alive)setError(messageOf(err));});return()=>{alive=false;};},[open]);
 const connection=data.modelConnections.find(item=>item.id===connectionId),showcase=data.executionPolicy==='showcase';
 async function generate(){if(busy)return;setBusy(true);setError('');try{const task=await write<Task>('/capabilities/author',{kind,prompt,connectionId,base});await onRefresh();setOpen(false);location.hash=`#task/${task.id}`;}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
 return <><Button color="secondary" variant="outline" size="sm" onClick={()=>setOpen(true)}><Plus/>{base?t('用对话改编','Adapt in chat'):t('从需求创建','Create from a brief')}</Button>{open&&<Dialog className="capability-dialog capability-authoring-dialog configuration-dialog settings-type-scale" title={base?t('改编已有专业能力','Adapt an existing capability'):t('创建专业能力','Create a capability')} onClose={()=>{if(!busy)setOpen(false);}}><form className="capability-fields" onSubmit={event=>{event.preventDefault();void generate();}}>
  <p className="ag-muted">{t('描述使用场景、可提供的材料和希望收到的结果。模型会生成可审阅的草稿，你可以在对话中继续修改，确认后再安装。','Describe the scenario, available inputs and expected result. The model creates a reviewable draft that you can revise in chat and install when ready.')}</p>
  <Field label={t('创建什么','Capability type')}><Select value={kind} onChange={option=>setKind(option.value as typeof kind)} disabled={busy||!!base} options={[{value:'expert',label:t('专家','Expert')},{value:'team',label:t('专家团','Expert team')},{value:'skill',label:t('可复用技能','Reusable skill')}]}/></Field>
  <Field label={t('需求与交付要求','Brief and deliverables')}><Textarea rows={5} maxLength={6000} value={prompt} onChange={event=>setPrompt(event.target.value)} disabled={busy} placeholder={t('例如：为小型设计团队建立客户访谈研究团，分工整理记录、归纳需求、复核证据，交付可追溯的研究简报。','For example: create a customer research team that reviews interviews, identifies needs and checks evidence to deliver a traceable research brief.')}/></Field>
  <Field label={t('使用的模型','Model')}><ConnectionSelect value={connectionId} onChange={setConnectionId} connections={data.modelConnections} includeInherit={false} disabled={busy}/></Field>
  <p className="ag-muted">{base?t('以已保存的工作说明为起点，新草稿不会覆盖原专家或团队。','Starts from the saved instructions. The draft does not replace the existing expert or team.'):t('本次只使用填写的需求，不自动读取个人画像或资料。','Uses the brief you enter, without automatically reading your profile or sources.')}</p>
  {showcase?<p className="capability-notice">{t('示例空间可查看创建流程；生成草稿需要在个人空间连接模型。','This example previews the flow. Generate drafts in your own space with a connected model.')}</p>:!connection?.hasKey&&<p className="capability-notice">{t('先在模型设置中完成连接。','Complete the model connection in Settings first.')} <a href="#settings/models">{t('模型设置','Model settings')}</a></p>}
  <ErrorNotice error={error}/><div className="ag-form-actions"><Button color="secondary" variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>{t('取消','Cancel')}</Button><Button color="primary" type="submit" loading={busy} disabled={showcase||!connection?.hasKey||!prompt.trim()}>{t('生成草稿','Generate draft')}<ArrowRight/></Button></div>
  {!!drafts.length&&<section><h3 className="settings-type-heading">{t('最近的能力草稿','Recent capability drafts')}</h3>{drafts.map(item=><div className="capability-draft-row" key={item.taskId}><div><strong>{item.title}</strong><p>{item.draft?.summary??t('尚未生成可安装草稿。','No installable draft yet.')}</p></div><ButtonLink href={`#task/${item.taskId}`} color="secondary" variant="ghost" size="sm" onClick={()=>setOpen(false)}>{t('继续','Continue')}</ButtonLink></div>)}</section>}
 </form></Dialog>}</>;
}

export function CapabilityDraftResult({task,onRefresh}:{task:Task;onRefresh:()=>Promise<void>}){
 const [preview,setPreview]=useState<CapabilityPreview>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const available=task.events.some(event=>event.type==='capability.draft'),running=['running','queued','awaiting_approval'].includes(task.status);
 if(!available)return null;
 async function review(){setBusy(true);setError('');try{setPreview(await write<CapabilityPreview>(`/capabilities/drafts/${task.id}`,{}));}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
 return <section className="capability-draft-result"><div><strong>{t('专业能力草稿','Capability draft')}</strong><p>{t('草稿已保存。核对角色、流程和依赖后，可安装到本空间；也可以继续对话修改。','Draft saved. Review its roles, workflow and dependencies before installing, or continue the conversation to revise it.')}</p></div><Button color="primary" loading={busy} disabled={running} onClick={()=>void review()}>{t('审阅并安装','Review and install')}</Button><ErrorNotice error={error}/>{preview&&<PackageImport initialPreview={preview} onClose={()=>setPreview(undefined)} onInstalled={async()=>{setPreview(undefined);await onRefresh();location.hash='#agents/discover';}}/>}</section>;
}
