import {useState} from 'react';
import type {AgentProfile,AgentRoom,Bootstrap} from '../../shared/contracts';
import type {CapabilityTeam} from '../../shared/capabilities';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {ArrowRight,Group} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,Field,ErrorNotice} from '../components';
import {write,messageOf} from '../api';
import {getLocale,t} from '../i18n';
import './capabilities.css';

export function ExpertTeams({data,onRefresh}:{data:Bootstrap;onRefresh:()=>Promise<void>}){
 const [selected,setSelected]=useState<CapabilityTeam>(),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const language=getLocale()==='en'?'en':'zh',teams=data.capabilities?.teams??[],experts=data.capabilities?.experts??[];
 const roster=selected?[selected.leadExpertId,...selected.memberExpertIds].flatMap(id=>experts.find(expert=>expert.id===id)??[]):[];
 const missing=roster.flatMap(expert=>expert.unresolvedSkills);
 async function create(){if(!selected||busy)return;setBusy(true);setError('');try{const result=await write<{agents:AgentProfile[];room:AgentRoom}>(`/capabilities/${selected.packageId}/create-team`,{teamId:selected.id,locale:language,name});await onRefresh();location.hash=`#agents/${result.room.id}`;}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
 return <div className="capability-manager">
  <p className="ag-muted">{t('选择一套专业分工，创建后可以调整成员、工作阶段、技能和资料。','Choose a professional workflow, then adjust members, stages, skills and sources in your own copy.')}</p>
  <div className="capability-package-list">{teams.map(team=><article className="capability-package-row" key={team.id}><div className="capability-package-copy"><h3>{team.title[language]}</h3><p>{team.description[language]}</p><div className="capability-package-meta"><span>{t(`${team.memberExpertIds.length+1} 位成员`,`${team.memberExpertIds.length+1} members`)}</span><span>{t(`${team.workflow?.length??0} 个阶段`,`${team.workflow?.length??0} stages`)}</span><span>{team.version}</span></div></div><Button color="secondary" variant="outline" size="sm" onClick={()=>{setSelected(team);setName(team.title[language]);setError('');}}>{t('了解并创建','Review and create')}<ArrowRight/></Button></article>)}</div>
  {!teams.length&&<p className="ag-muted">{t('暂无已启用的专家团。可在技能与工具中导入专家团包。','No enabled teams. Import a team package in Skills and tools.')}</p>}
  {selected&&<Dialog className="capability-dialog configuration-dialog settings-type-scale" title={selected.title[language]} onClose={()=>{if(!busy)setSelected(undefined);}}><form className="capability-fields" onSubmit={event=>{event.preventDefault();void create();}}>
   <p className="ag-muted">{selected.description[language]}</p>
   <Field label={t('团队名称','Team name')}><Input value={name} maxLength={200} onChange={event=>setName(event.target.value)} disabled={busy}/></Field>
   <section><h3 className="settings-type-heading">{t('成员与分工','Members and responsibilities')}</h3>{roster.map(expert=><div className="capability-team-member" key={expert.id}><strong>{expert.title[language]}{expert.id===selected.leadExpertId?` · ${t('负责人','Lead')}`:''}</strong><p>{expert.role[language]}</p><small>{t(`${expert.skillIds.length} 项绑定技能`,`${expert.skillIds.length} bound skills`)}</small></div>)}</section>
   {!!selected.workflow?.length&&<section><h3 className="settings-type-heading">{t('工作流程','Workflow')}</h3><ol className="capability-team-stages">{selected.workflow.map(stage=><li key={stage.id}><strong>{stage.title[language]}</strong><p>{stage.description[language]}</p><small>{stage.memberExpertIds.map(id=>experts.find(expert=>expert.id===id)?.title[language]).join('、')}</small></li>)}</ol></section>}
   {!!selected.quickPrompts.length&&<section><h3 className="settings-type-heading">{t('可以交给团队的任务','Example task')}</h3>{selected.quickPrompts.map((prompt,index)=><p key={index}>{prompt[language]}</p>)}</section>}
   {!!missing.length&&<p className="capability-notice">{t('尚需安装的技能：','Missing skills: ')}{missing.join('、')}</p>}
   <p className="ag-muted">{t('创建会保存独立的专家和团队副本，不会开始执行任务。账号与私人资料需另行选择。','Creates independent experts and a team without starting a task. Choose accounts and private sources separately.')}</p>
   <ErrorNotice error={error}/><div className="ag-form-actions"><Button color="secondary" variant="ghost" onClick={()=>setSelected(undefined)} disabled={busy}>{t('取消','Cancel')}</Button><Button color="primary" type="submit" loading={busy} disabled={!name.trim()||!!missing.length}><Group/>{t('创建专家团','Create team')}</Button></div>
  </form></Dialog>}
 </div>;
}
