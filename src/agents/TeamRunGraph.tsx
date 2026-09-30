import {useState} from 'react';
import type {AgentProfile,Task,TeamRunNode} from '../../shared/contracts';
import {AgentAvatar} from './AgentIdentity';
import {TaskBadge,RichText} from '../components';
import {t} from '../i18n';
import './team-run.css';

/** An execution view backed only by saved runtime nodes. */
export function TeamRunGraph({task,agents}:{task:Task;agents:AgentProfile[]}){
  const [runId,setRunId]=useState(''),[nodeId,setNodeId]=useState('');
  const runs=task.teamRuns||[],run=runs.find(item=>item.id===runId)||runs.at(-1);
  if(!run)return null;
  const lead=run.nodes.find(node=>node.kind==='lead'),workers=run.nodes.filter(node=>node.kind==='worker');
  const selected=run.nodes.find(node=>node.id===nodeId)||lead;
  const card=(node:TeamRunNode)=><button type="button" key={node.id} className="team-run-node" data-kind={node.kind} aria-pressed={selected?.id===node.id} onClick={()=>setNodeId(node.id)}><AgentAvatar agent={agents.find(item=>item.id===node.agentId)||{id:node.agentId,name:node.name}} size={32}/><span className="team-run-node-copy"><strong>{node.name}</strong><small>{node.kind==='lead'?t('负责人','Lead'):t('临时协作','Temporary assignment')}</small></span><TaskBadge status={node.status}/></button>;
  return <section className="team-run" aria-label={t('团队协作过程','Team execution')}>
    <header><strong>{t('团队协作','Team execution')}</strong><span>{t(`${workers.length} 项分工`,`${workers.length} assignments`)}</span></header>
    {runs.length>1&&<nav aria-label={t('执行轮次','Execution attempts')}>{runs.map((item,index)=><button type="button" key={item.id} aria-pressed={item.id===run.id} onClick={()=>{setRunId(item.id);setNodeId('');}}>{t(`第 ${index+1} 轮`,`Run ${index+1}`)}</button>)}</nav>}
    <div className="team-run-tree">{lead&&card(lead)}{workers.length>0&&<div className="team-run-workers">{workers.map(card)}</div>}</div>
    {selected&&<div className="team-run-detail"><div><strong>{selected.name}</strong><TaskBadge status={selected.status}/></div><p>{selected.objective}</p>{selected.error?<p role="alert" className="team-run-error">{selected.error}</p>:selected.result?<details><summary>{selected.resultTruncated?t('查看交付节选','View result excerpt'):t('查看交付','View result')}</summary>{selected.resultTruncated&&<small>{t(`已保留前 16,000 字符，原结果共 ${selected.resultOriginalChars?.toLocaleString()??'超过 16,000'} 字符。`, `Showing the first 16,000 characters of ${selected.resultOriginalChars?.toLocaleString()??'over 16,000'}.`)}</small>}<RichText>{selected.result}</RichText></details>:<small>{selected.status==='completed'?t('本轮没有返回文本产物。','No text result was returned.'):t('进展会随实际执行更新。','Progress updates as the work runs.')}</small>}</div>}
  </section>;
}
