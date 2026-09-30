import type { AgentProfile, Task } from '../../shared/contracts';
import { EXPERT_TEMPLATES, existingExpert } from './expertTemplates.ts';

const sampleDomains:Record<string,string>={'agent-planner':'quality','agent-reviewer':'quality','agent-writer':'creation','agent-researcher':'industry','agent-budget':'finance','agent-care':'life'};
export function savedAgentDomain(agent:AgentProfile):string {
 const sample=Object.entries(sampleDomains).find(([id])=>agent.id===id||agent.id.startsWith('demo-')&&agent.id.endsWith(id));
 if(sample)return sample[1];
 return EXPERT_TEMPLATES.find(template=>existingExpert([agent],template))?.category||'custom';
}
export function savedAgentLastUsed(agent:AgentProfile,tasks:readonly Task[]):string {
 return tasks.reduce((latest,task)=>task.agentIds.includes(agent.id)&&task.updatedAt>latest?task.updatedAt:latest,'');
}
export function filterSavedAgents(agents:readonly AgentProfile[],tasks:readonly Task[],query:string,domain:string,sort:string):AgentProfile[]{
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return agents.filter(agent=>agent.id!=='hither'&&(domain==='all'||savedAgentDomain(agent)===domain)&&terms.every(term=>`${agent.name} ${agent.role} ${agent.instructions}`.toLocaleLowerCase().includes(term))).sort((a,b)=>{
  const nameOrder=a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id);
  return sort==='name'?nameOrder:sort==='created'?b.createdAt.localeCompare(a.createdAt)||nameOrder:savedAgentLastUsed(b,tasks).localeCompare(savedAgentLastUsed(a,tasks))||b.createdAt.localeCompare(a.createdAt)||nameOrder;
 });
}
