import type {AgentProfile} from '../../shared/contracts';
import type {TeamWorkflowStage} from '../../shared/team-run-types';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Checkbox} from '@openai/apps-sdk-ui/components/Checkbox';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Plus,X} from '@openai/apps-sdk-ui/components/Icon';
import {Field} from '../components';
import {t} from '../i18n';

export function TeamWorkflowFields({value,onChange,members,leadId,disabled}:{value:TeamWorkflowStage[];onChange:(value:TeamWorkflowStage[])=>void;members:AgentProfile[];leadId:string;disabled:boolean}){
 const workers=members.filter(member=>member.id!==leadId);
 const update=(id:string,patch:Partial<TeamWorkflowStage>)=>onChange(value.map(stage=>stage.id===id?{...stage,...patch}:stage));
 const toggle=(items:string[],id:string,checked:boolean)=>checked?[...items,id]:items.filter(item=>item!==id);
 return <section className="ag-workflow-editor" aria-label={t('工作流程','Workflow')}>
  <div className="ag-room-section-heading"><strong>{t('工作流程','Workflow')}</strong><span>{value.length} / 20</span></div>
  <p className="ag-muted">{t('留空时由负责人按任务分工。添加阶段后，负责人须完成指定流程并收齐结果。','Leave empty for flexible delegation. Defined stages must finish and their results must be collected.')}</p>
  {value.map((stage,index)=><fieldset className="ag-workflow-stage" key={stage.id}>
   <legend>{t(`阶段 ${index+1}`,`Stage ${index+1}`)}</legend>
   <div className="ag-workflow-title"><Input aria-label={t(`阶段 ${index+1} 名称`,`Stage ${index+1} title`)} value={stage.title} maxLength={200} disabled={disabled} onChange={event=>update(stage.id,{title:event.target.value})}/><Button color="secondary" variant="ghost" uniform disabled={disabled} aria-label={t(`移除阶段 ${index+1}`,`Remove stage ${index+1}`)} onClick={()=>onChange(value.filter(item=>item.id!==stage.id).map(item=>({...item,after:item.after.filter(id=>id!==stage.id)})))}><X/></Button></div>
   <Field label={t('工作与交付要求','Work and deliverables')}><Textarea rows={3} maxLength={6000} value={stage.description} disabled={disabled} onChange={event=>update(stage.id,{description:event.target.value})}/></Field>
   <fieldset className="ag-workflow-options"><legend>{t('负责成员','Assigned specialists')}</legend>{workers.map(member=><Checkbox key={member.id} label={member.name} checked={stage.agentIds.includes(member.id)} disabled={disabled} onCheckedChange={checked=>update(stage.id,{agentIds:toggle(stage.agentIds,member.id,checked)})}/>)}{stage.agentIds.some(id=>!workers.some(member=>member.id===id))&&<p role="status" className="capability-notice">{t('原成员已移除或成为负责人，请重新分配此阶段。','A member was removed or became the lead. Reassign this stage.')}<Button size="sm" color="secondary" variant="ghost" disabled={disabled} onClick={()=>update(stage.id,{agentIds:stage.agentIds.filter(id=>workers.some(member=>member.id===id))})}>{t('清除失效成员','Clear unavailable members')}</Button></p>}</fieldset>
   {index>0&&<fieldset className="ag-workflow-options"><legend>{t('等待哪些前置阶段','Prerequisite stages')}</legend>{value.slice(0,index).map(item=><Checkbox key={item.id} label={item.title||t('未命名阶段','Untitled stage')} checked={stage.after.includes(item.id)} disabled={disabled} onCheckedChange={checked=>update(stage.id,{after:toggle(stage.after,item.id,checked)})}/>)}</fieldset>}
   <Checkbox label={t('交付前必须完成','Required before delivery')} checked={stage.required} disabled={disabled} onCheckedChange={required=>update(stage.id,{required})}/>
  </fieldset>)}
  <Button color="secondary" variant="outline" disabled={disabled||value.length>=20||!workers.length} onClick={()=>onChange([...value,{id:`stage-${crypto.randomUUID()}`,title:t(`阶段 ${value.length+1}`,`Stage ${value.length+1}`),description:'',agentIds:[],after:value.length?[value[value.length-1].id]:[],required:true}])}><Plus/>{t('添加工作阶段','Add a stage')}</Button>
 </section>;
}
