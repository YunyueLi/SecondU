import {randomUUID} from 'node:crypto';
import {HttpError} from './http-error.mjs';
const id=prefix=>`${prefix}-${randomUUID()}`,now=()=>new Date().toISOString();
export const TEAM_LIMITS=Object.freeze({concurrency:4,nodes:8});
const active=new Set(['queued','running','awaiting_approval','needs_input']);
export function teamConfiguration(value,agentIds,kind) {
  if(value==null)return undefined;
  if(kind!=='group'||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>key!=='leadAgentId')||typeof value.leadAgentId!=='string'||!agentIds.includes(value.leadAgentId))throw new HttpError(400,'团队负责人必须是当前群聊中的一位成员。','team_configuration_invalid');
  return {leadAgentId:value.leadAgentId};
}
export function assertTeamProvider(settings) {
  if(!['responses','chat_completions','messages'].includes(settings?.api))throw new HttpError(409,'当前连接协议没有团队工具适配，请为负责人和受派专家选择受支持的模型连接。','team_provider_unsupported');
}
export function interruptTeamRuns(task,reason='运行进程已结束，未自动重新执行。') {
  for(const run of task.teamRuns??[]){
    if(active.has(run.status)){run.status='interrupted';run.finishedAt=now();}
    for(const node of run.nodes)if(active.has(node.status)){node.status='interrupted';node.error=reason;node.finishedAt=now();}
  }
}
const tool=(name,description,properties={},required=[])=>({type:'function',name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}});
export const TEAM_TOOLS=Object.freeze([
  tool('team_delegate','Assign a bounded task to one configured specialist. Returns a run node ID immediately. Use team_wait to collect the result before your final answer.',{agentId:{type:'string'},task:{type:'string',minLength:1,maxLength:12000}},['agentId','task']),
  tool('team_status','Inspect the actual current team run and results.'),
  tool('team_wait','Wait for explicitly listed worker node IDs in this run and return their recorded results. resultTruncated means only the first 16000 characters are available; do not treat an excerpt as a complete result. Ask a specialist for a focused summary when necessary.',{nodeIds:{type:'array',items:{type:'string'},minItems:1,maxItems:7}},['nodeIds']),
]);
const response=(value,success=true)=>({success,contentItems:[{type:'inputText',text:JSON.stringify(value)}]});
export class TeamCoordinator {
  constructor({taskId,lead,agents,signal,mutate,read,runWorker,cleanError}) {
    this.taskId=taskId;this.agents=agents;this.signal=signal;this.mutate=mutate;this.read=read;this.runWorker=runWorker;this.cleanError=cleanError;this.work=new Map();this.collected=new Set();this.closed=false;
    const stamp=now();this.runId=id('team-run');this.leadNodeId=id('team-node');
    this.update(task=>{task.teamRuns??=[];task.teamRuns.push({id:this.runId,leadAgentId:lead.id,status:'running',startedAt:stamp,nodes:[{id:this.leadNodeId,kind:'lead',agentId:lead.id,name:lead.name,role:lead.role,objective:task.messages.filter(m=>m.role==='user').at(-1)?.content??task.prompt,status:'running',createdAt:stamp,startedAt:stamp}]});});
  }
  update(fn){return this.mutate(this.taskId,fn);}
  snapshot(){return this.read().teamRuns.find(run=>run.id===this.runId);}
  result(value){const content=this.cleanError(String(value??''),Infinity);return {result:content.slice(0,16000),resultTruncated:content.length>16000,resultOriginalChars:content.length};}
  node(nodeId,patch){this.update(task=>{const run=task.teamRuns.find(run=>run.id===this.runId),node=run.nodes.find(node=>node.id===nodeId);if(node&&active.has(node.status))Object.assign(node,patch);if(active.has(run.status))run.status=run.nodes.some(item=>item.status==='awaiting_approval')?'awaiting_approval':'running';});}
  async call({tool,arguments:args}) {
    try {
      if(this.closed||this.signal.aborted)throw new HttpError(409,'本轮团队任务已经停止。','team_stopped');
      if(!args||typeof args!=='object'||Array.isArray(args))throw new HttpError(400,'团队工具参数无效。','team_arguments');
      if(tool==='team_status'){if(Object.keys(args).length)throw new HttpError(400,'团队状态查询不接受参数。');return response(this.snapshot());}
      if(tool==='team_wait'){
        if(Object.keys(args).some(key=>key!=='nodeIds')||!Array.isArray(args.nodeIds)||!args.nodeIds.length||args.nodeIds.length>7||args.nodeIds.some(key=>typeof key!=='string'||!this.work.has(key)))throw new HttpError(400,'只能等待当前团队中已派发的任务。','team_node_not_found');
        await Promise.all([...new Set(args.nodeIds)].map(key=>this.work.get(key)));
        for(const nodeId of args.nodeIds)this.collected.add(nodeId);
        return response({nodes:this.snapshot().nodes.filter(node=>args.nodeIds.includes(node.id))});
      }
      if(tool!=='team_delegate'||Object.keys(args).some(key=>!['agentId','task'].includes(key))||typeof args.task!=='string'||!args.task.trim()||args.task.length>12000)throw new HttpError(400,'团队任务参数无效。','team_arguments');
      const run=this.snapshot(),agent=this.agents.find(agent=>agent.id===args.agentId&&agent.id!==run.leadAgentId);
      if(!agent)throw new HttpError(400,'只能派发给团队中已选择的其他专家。','team_agent_invalid');
      if(run.nodes.length>=TEAM_LIMITS.nodes)throw new HttpError(409,'本轮团队已达到 8 个执行节点上限。','team_node_limit');
      if(run.nodes.filter(node=>node.kind==='worker'&&active.has(node.status)).length>=TEAM_LIMITS.concurrency)throw new HttpError(409,'已有 4 位专家在执行，请先等待其中一项结束。','team_concurrency_limit');
      const node={id:id('team-node'),parentId:this.leadNodeId,kind:'worker',agentId:agent.id,name:agent.name,role:agent.role,objective:args.task.trim(),status:'queued',createdAt:now()};
      this.update(task=>task.teamRuns.find(run=>run.id===this.runId).nodes.push(node));
      const promise=Promise.resolve().then(async()=>{
        if(this.signal.aborted)throw Object.assign(new Error('团队任务已停止。'),{name:'AbortError'});
        this.node(node.id,{status:'running',startedAt:now()});
        const result=await this.runWorker(agent,node,(status)=>this.node(node.id,{status}));
        if(this.signal.aborted)throw Object.assign(new Error('团队任务已停止。'),{name:'AbortError'});
        this.node(node.id,{status:'completed',...this.result(result.text),finishedAt:now()});
      }).catch(error=>this.node(node.id,{status:this.signal.aborted||error.name==='AbortError'?'interrupted':'failed',error:this.cleanError(error.message),finishedAt:now()}));
      this.work.set(node.id,promise);
      return response({nodeId:node.id,status:'queued'});
    } catch(error){return response({error:this.cleanError(error.message),code:error.code??'team_error'},false);}
  }
  finish(result) {
    const run=this.snapshot();
    if(run.nodes.some(node=>node.kind==='worker'&&(active.has(node.status)||!this.collected.has(node.id))))throw new HttpError(409,'负责人尚未收齐团队结果，本轮不能标记完成。','team_uncollected');
    this.closed=true;this.node(this.leadNodeId,{status:'completed',...this.result(result),finishedAt:now()});
    this.update(task=>Object.assign(task.teamRuns.find(run=>run.id===this.runId),{status:'completed',finishedAt:now()}));
  }
  async stop(status,error) {
    this.closed=true;await Promise.allSettled([...this.work.values()]);
    this.update(task=>{const run=task.teamRuns.find(run=>run.id===this.runId);if(!run||!active.has(run.status))return;run.status=status;run.finishedAt=now();for(const node of run.nodes)if(active.has(node.status))Object.assign(node,{status,error:this.cleanError(error),finishedAt:now()});});
  }
}
