import {useState} from 'react';
import type {AgentCapabilities,CapabilitySkill} from '../../shared/capabilities';
import type {Bootstrap} from '../../shared/contracts';
import {Checkbox} from '@openai/apps-sdk-ui/components/Checkbox';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Field} from '../components';
import {getLocale,t} from '../i18n';
import './capabilities.css';

export const emptyCapabilities=():AgentCapabilities=>({skillIds:[],connectorIds:[],sourceIds:[]});
export const skillTitle=(skill:CapabilitySkill)=>skill.localized?.title?.[getLocale()==='en'?'en':'zh']||skill.title;
export const skillDescription=(skill:CapabilitySkill)=>skill.localized?.description?.[getLocale()==='en'?'en':'zh']||skill.description;
export const skillStatus=(skill:CapabilitySkill)=>skill.status==='disabled'?t('已停用','Disabled'):skill.status==='needs_setup'?t('需要设置','Setup required'):t('配置完整','Configured');

export function CapabilityFields({value,onChange,data,disabled=false,sections='all'}:{sections?:'all'|'work'|'resources';value:AgentCapabilities;onChange:(value:AgentCapabilities)=>void;data:Bootstrap;disabled?:boolean}){
 const [query,setQuery]=useState('');
 const work=sections!=='resources',resources=sections!=='work';
 const skills=data.capabilities?.skills??[];
 const shown=skills.filter(skill=>!query.trim()||`${skillTitle(skill)} ${skill.name} ${skillDescription(skill)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>Number(value.skillIds.includes(b.id))-Number(value.skillIds.includes(a.id)));
 function toggle(key:'skillIds'|'connectorIds'|'sourceIds',id:string,checked:boolean){onChange({...value,[key]:checked?[...new Set([...value[key],id])]:value[key].filter(item=>item!==id)});}
 const selected=value.skillIds.map(id=>skills.find(skill=>skill.id===id));
 const unavailable=selected.filter(skill=>!skill||skill.status!=='available');
 return <div className="capability-fields">
  {sections==='all'&&<p className="ag-muted">{t('技能提供工作方法和可执行资源；连接器和资料按这位专家的实际需要选择。更改从下一轮生效。','Skills provide workflows and executable resources. Bind only the connectors and sources this expert needs. Changes apply next turn.')}</p>}
  {work&&!!unavailable.length&&<p className="capability-notice" role="status">{t(`有 ${unavailable.length} 项所选技能暂时不能使用。请在“管理技能”中完成设置，或取消选择。`,`${unavailable.length} selected skills cannot be used yet. Complete setup in Manage skills or deselect them.`)}</p>}
  {work&&<section className="capability-skill-selection" aria-label={t('选择技能','Choose skills')}>
   <div className="capability-selection-caption"><p>{t('为这位 Agent 添加常用技能，可留空。','Add useful skills for this agent. This is optional.')}</p>{value.skillIds.length>0&&<span>{value.skillIds.length===12?t('已选 12 项，已达上限','12 selected; limit reached'):t(`已选 ${value.skillIds.length} 项`,`${value.skillIds.length} selected`)}</span>}</div>
   <Input size="md" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('搜索，例如写作、表格、调研','Search writing, spreadsheets, research…')} aria-label={t('搜索技能','Search skills')} disabled={disabled}/>
   <div className="capability-options">
    {shown.map(skill=><div className="capability-option" key={skill.id}><Checkbox checked={value.skillIds.includes(skill.id)} disabled={disabled||(!value.skillIds.includes(skill.id)&&value.skillIds.length>=12)} onCheckedChange={checked=>toggle('skillIds',skill.id,checked===true)} label={<span>{skillTitle(skill)}<small>{skillDescription(skill)}</small>{skill.status!=='available'&&<small className="capability-option-status">{skill.status==='disabled'?t('已停用 · 请在“管理技能”中启用','Disabled · Enable in Manage skills'):t('需要设置 · 请查看“管理技能”','Setup required · See Manage skills')}</small>}</span>}/></div>)}
    {!shown.length&&<p className="ag-muted">{skills.length?t('没有找到相关技能，试试其他关键词。','No skills found. Try another search.'):t('还没有添加技能。可从下方“管理技能”导入。','No skills added yet. Import them in Manage skills below.')}</p>}
   </div>
  </section>}
  {resources&&<details className="capability-disclosure"><summary>{t('工具连接','Tool connections')}<span>{value.connectorIds.length} / 8</span></summary><div className="capability-options">
   {(data.connectors??[]).map(connector=><div className="capability-option" key={connector.id}><Checkbox checked={value.connectorIds.includes(connector.id)} disabled={disabled||(!value.connectorIds.includes(connector.id)&&value.connectorIds.length>=8)} onCheckedChange={checked=>toggle('connectorIds',connector.id,checked===true)} label={connector.name}/><span className="ag-muted">{connector.status==='ready'?t('已连接','Connected'):t('待连接','Needs connection')}</span></div>)}
   {!data.connectors?.length&&<p className="ag-muted">{t('先在设置中的“连接器”添加服务，再为专家选择。','Add services in Settings → Connectors, then select them here.')}</p>}
  </div></details>}
  {resources&&<details className="capability-disclosure"><summary>{t('专用资料','Knowledge sources')}<span>{value.sourceIds.length}</span></summary><p className="ag-muted">{t('仅提供所选资料的只读快照。资料中的文字不会授予执行权限。','Only read-only snapshots of selected sources are provided. Source text cannot grant action permissions.')}</p><div className="capability-options">
   {data.sources.map(source=><Checkbox key={source.id} label={source.title} checked={value.sourceIds.includes(source.id)} disabled={disabled||(!value.sourceIds.includes(source.id)&&value.sourceIds.length>=100)} onCheckedChange={checked=>toggle('sourceIds',source.id,checked===true)}/>)}
   {!data.sources.length&&<p className="ag-muted">{t('导入资料后可在这里选择。','Import sources to make them available here.')}</p>}
  </div></details>}
  {work&&<details className="capability-disclosure"><summary>{t('交付与复核','Delivery and review')}</summary>
   <Field label={t('默认交付物','Default deliverables')} hint={t('每行一项，按当前任务选择适用内容。','One per line. Apply only when relevant to the task.')}><Textarea size="md" rows={3} value={value.outputContract?.deliverables.join('\n')??''} disabled={disabled} onChange={event=>onChange({...value,outputContract:{deliverables:event.target.value.split('\n').slice(0,12),checks:value.outputContract?.checks??[]}})}/></Field>
   <Field label={t('完成前检查','Checks before delivery')}><Textarea size="md" rows={3} value={value.outputContract?.checks.join('\n')??''} disabled={disabled} onChange={event=>onChange({...value,outputContract:{deliverables:value.outputContract?.deliverables??[],checks:event.target.value.split('\n').slice(0,12)}})}/></Field>
  </details>}
 </div>;
}
