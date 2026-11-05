import {normalizeProgram,programArguments,programHash,runProgram} from './workflow-program.mjs';
import {randomUUID} from 'node:crypto';
import {latestWorkflowNode,workflowAssignmentNodes} from '../shared/workflow-state.mjs';
import {HttpError} from './http-error.mjs';
const id=prefix=>`${prefix}-${randomUUID()}`,now=()=>new Date().toISOString();
export const TEAM_LIMITS=Object.freeze({concurrency:4,nodes:8});
export const TEAM_MAXIMUMS=Object.freeze({members:24,concurrency:4,nodes:72});
export function teamLimits(configuration){return {nodes:configuration?.maxNodes??TEAM_LIMITS.nodes,concurrency:configuration?.concurrency??TEAM_LIMITS.concurrency};}
const active=new Set(['queued','running','awaiting_approval','needs_input']);
export function teamConfiguration(value,agentIds,kind) {
  if(value==null)return undefined;
  if(kind!=='group'||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['leadAgentId','maxNodes','concurrency','workflow','defaultConnectionId','reviewBeforeRun','program'].includes(key))||typeof value.leadAgentId!=='string'||!agentIds.includes(value.leadAgentId))throw new HttpError(400,'团队负责人必须是当前群聊中的一位成员。','team_configuration_invalid');
  const result={leadAgentId:value.leadAgentId};
  if(value.program!==undefined)result.program=normalizeProgram(value.program);
  if(value.reviewBeforeRun!==undefined){if(typeof value.reviewBeforeRun!=='boolean')throw new HttpError(400,'工作流确认设置无效。','team_configuration_invalid');result.reviewBeforeRun=value.reviewBeforeRun;}
  if(value.defaultConnectionId!==undefined){if(typeof value.defaultConnectionId!=='string'||!value.defaultConnectionId||value.defaultConnectionId.length>200)throw new HttpError(400,'工作流模型连接无效。','team_configuration_invalid');result.defaultConnectionId=value.defaultConnectionId;}
  for(const [key,min,max] of [['maxNodes',2,TEAM_MAXIMUMS.nodes],['concurrency',1,TEAM_MAXIMUMS.concurrency]])if(value[key]!==undefined){if(!Number.isSafeInteger(value[key])||value[key]<min||value[key]>max)throw new HttpError(400,`团队 ${key} 须为 ${min}–${max} 之间的整数。`,'team_configuration_invalid');result[key]=value[key];}
  if(value.workflow!==undefined){
    if(!Array.isArray(value.workflow)||value.workflow.length>20)throw new HttpError(400,'团队流程最多包含 20 个阶段。','team_workflow_invalid');
    const ids=new Set();result.workflow=value.workflow.map(stage=>{
      if(!stage||typeof stage!=='object'||typeof stage.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(stage.id)||ids.has(stage.id)||typeof stage.title!=='string'||!stage.title.trim()||stage.title.length>200||typeof(stage.description??'')!=='string'||(stage.description??'').length>6000||!Array.isArray(stage.agentIds)||!stage.agentIds.length||stage.agentIds.some(id=>id===value.leadAgentId||!agentIds.includes(id))||!Array.isArray(stage.after??[])||(stage.after??[]).some(id=>!ids.has(id))||stage.required!==undefined&&typeof stage.required!=='boolean')throw new HttpError(400,'流程阶段需要唯一名称、有效成员，以及位于此前的依赖阶段。','team_workflow_invalid');
      if(stage.expectedOutput!==undefined&&(typeof stage.expectedOutput!=='string'||stage.expectedOutput.length>2000))throw new HttpError(400,'阶段成果说明无效。','team_workflow_invalid');
      if(stage.inputArtifactIds!==undefined&&(!Array.isArray(stage.inputArtifactIds)||stage.inputArtifactIds.length>12||stage.inputArtifactIds.some(id=>typeof id!=='string'||!id)))throw new HttpError(400,'阶段输入文件无效。','team_artifact_scope');
      if(stage.connectionIds!==undefined&&(!stage.connectionIds||typeof stage.connectionIds!=='object'||Array.isArray(stage.connectionIds)||Object.entries(stage.connectionIds).some(([agentId,connectionId])=>!stage.agentIds.includes(agentId)||typeof connectionId!=='string'||!connectionId||connectionId.length>200)))throw new HttpError(400,'阶段模型需要对应有效成员。','team_workflow_invalid');
      ids.add(stage.id);return {...(stage.inputArtifactIds?.length?{inputArtifactIds:[...new Set(stage.inputArtifactIds)]}:{}),...(stage.expectedOutput?{expectedOutput:stage.expectedOutput.trim()}:{}),...(stage.connectionIds?{connectionIds:{...stage.connectionIds}}:{}),id:stage.id,title:stage.title.trim(),description:(stage.description??'').trim(),agentIds:[...new Set(stage.agentIds)],after:[...new Set(stage.after??[])],required:stage.required!==false};
    });
    const minimum=1+result.workflow.reduce((sum,stage)=>sum+stage.agentIds.length,0);
    if(minimum>teamLimits(result).nodes)throw new HttpError(400,`完整运行当前流程至少需要 ${minimum} 个任务节点，请提高上限或减少阶段。`,'team_workflow_limit');
  }
  return result;
}
export function assertTeamProvider(settings) {
  if(!['responses','chat_completions','messages'].includes(settings?.api))throw new HttpError(409,'当前连接协议没有团队工具适配，请为负责人和受派专家选择受支持的模型连接。','team_provider_unsupported');
}
export function interruptTeamRuns(task,reason='运行进程已结束，未自动重新执行。') {
  for(const plan of task.workflowPlans??[])if(plan.status==='pending')plan.status='interrupted';
  for(const run of task.teamRuns??[]){
    if(active.has(run.status)){run.status='interrupted';run.finishedAt=now();}
    for(const node of run.nodes)if(active.has(node.status)){node.status='interrupted';node.error=reason;node.finishedAt=now();}
  }
}
const tool=(name,description,properties={},required=[])=>({type:'function',name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}});
export const TEAM_TOOLS=Object.freeze([
  tool('team_plan','Propose a staged workflow for user review before delegating. Waits for the user to confirm, reject, or request changes. After confirmation the runtime automatically dispatches every approved assignment, enforces dependencies and concurrency, passes predecessor files, and returns actual results. Do not delegate the confirmed stages again. Use for multi-step work. Define sequential dependencies with after; independent stages may run in parallel. A stage may assign several configured specialists. Never delegate a rejected plan.',{title:{type:'string',minLength:1,maxLength:200},defaultConnectionId:{type:'string'},program:{type:'object',description:'Optional reusable JavaScript orchestration: source, parameters [{name,label,type:string|number|boolean,required,default?,description?}], args. Read args.name, await workflow.run(stageId,{key?:uniqueStableKey,input?:string}); returns {nodes,artifacts,results}. Promise.all runs independent stages in parallel. Loops and conditions are supported; every run call needs a stable unique key. No imports, filesystem, network, Date or randomness. Keep variable material in args, never hardcode previous conclusions.'},stages:{type:'array',minItems:1,maxItems:20,items:{type:'object',properties:{id:{type:'string'},title:{type:'string'},description:{type:'string'},expectedOutput:{type:'string'},inputArtifactIds:{type:'array',items:{type:'string'},maxItems:12},connectionIds:{type:'object',additionalProperties:{type:'string'}},agentIds:{type:'array',items:{type:'string'}},after:{type:'array',items:{type:'string'}},required:{type:'boolean'}},required:['id','title','description','agentIds','after','required'],additionalProperties:false}}},['title','stages']),
  tool('team_delegate','Assign a bounded task to one configured specialist. When a workflow is configured, supply its stageId and finish all prerequisite stages first. Returns a run node ID immediately. Use team_wait to collect the result before your final answer.',{agentId:{type:'string'},task:{type:'string',minLength:1,maxLength:12000},stageId:{type:'string'},artifactIds:{type:'array',items:{type:'string'},maxItems:12}},['agentId','task']),
  tool('team_status','Inspect the actual current team run and results.'),
  tool('team_wait','Wait for explicitly listed worker node IDs in this run and return their recorded results. resultTruncated means only the first 16000 characters are available; do not treat an excerpt as a complete result. Ask a specialist for a focused summary when necessary.',{nodeIds:{type:'array',items:{type:'string'},minItems:1,maxItems:71}},['nodeIds']),
]);
const response=(value,success=true)=>({success,contentItems:[{type:'inputText',text:JSON.stringify(value)}]});
export class TeamCoordinator {
  constructor({taskId,lead,agents,signal,mutate,read,runWorker,cleanError,artifactLookup,requestPlan,resumeRunId}) {
    this.taskId=taskId;this.agents=agents;this.signal=signal;this.mutate=mutate;this.read=read;this.runWorker=runWorker;this.cleanError=cleanError;this.work=new Map();this.collected=new Set();this.closed=false;this.limits=teamLimits(read().team);this.artifactLookup=artifactLookup;this.requestPlan=requestPlan;
    if(resumeRunId){
      const prior=read().teamRuns.find(run=>run.id===resumeRunId);this.runId=prior.id;this.leadNodeId=prior.nodes.find(node=>node.kind==='lead').id;this.managed=true;
      for(const node of prior.nodes)if(node.status==='completed'){this.collected.add(node.id);this.work.set(node.id,Promise.resolve());}
      this.update(task=>{const run=task.teamRuns.find(run=>run.id===resumeRunId);run.status='running';delete run.finishedAt;run.resumptions??=[];run.resumptions.push(now());const lead=run.nodes.find(node=>node.kind==='lead');lead.status='running';delete lead.error;delete lead.finishedAt;});return;
    }
    const stamp=now();this.runId=id('team-run');this.leadNodeId=id('team-node');
    this.update(task=>{task.teamRuns??=[];task.teamRuns.push({id:this.runId,leadAgentId:lead.id,limits:this.limits,workflow:structuredClone(task.team?.workflow??[]),defaultConnectionId:task.team?.defaultConnectionId,status:'running',startedAt:stamp,nodes:[{id:this.leadNodeId,kind:'lead',agentId:lead.id,name:lead.name,role:lead.role,objective:task.messages.filter(m=>m.role==='user').at(-1)?.content??task.prompt,status:'running',createdAt:stamp,startedAt:stamp}]});});
  }
  update(fn){return this.mutate(this.taskId,fn);}
  snapshot(){return this.read().teamRuns.find(run=>run.id===this.runId);}
  stageComplete(stage){return stage.agentIds.every(agentId=>{const nodes=workflowAssignmentNodes(this.snapshot(),stage.id,agentId);return nodes.length&&nodes.every(node=>node.status==='completed'&&this.collected.has(node.id));});}
  result(value){const content=this.cleanError(String(value??''),Infinity);return {result:content.slice(0,16000),resultTruncated:content.length>16000,resultOriginalChars:content.length};}
  node(nodeId,patch){this.update(task=>{const run=task.teamRuns.find(run=>run.id===this.runId),node=run.nodes.find(node=>node.id===nodeId);if(node&&active.has(node.status))Object.assign(node,patch);if(active.has(run.status))run.status=run.nodes.some(item=>item.status==='awaiting_approval')?'awaiting_approval':'running';});}
  async call({tool,arguments:args},{scheduled=false,stepKey}={}) {
    try {
      if(this.closed||this.signal.aborted)throw new HttpError(409,'本轮团队任务已经停止。','team_stopped');
      if(!args||typeof args!=='object'||Array.isArray(args))throw new HttpError(400,'团队工具参数无效。','team_arguments');
      if(tool==='team_plan'){
        if(Object.keys(args).some(key=>!['title','stages','defaultConnectionId','program'].includes(key))||typeof args.title!=='string'||!args.title.trim()||args.title.length>200||!Array.isArray(args.stages)||!args.stages.length)throw new HttpError(400,'请提供工作流名称与阶段。','workflow_plan_invalid');
        if(!this.requestPlan)throw new HttpError(409,'当前运行不支持工作流确认。','workflow_plan_unavailable');
        if(this.snapshot().nodes.some(node=>node.kind==='worker'))throw new HttpError(409,'本轮已开始执行。请完成或停止后在原对话中追加要求。','workflow_started');
        const team=teamConfiguration({...this.read().team,...(args.defaultConnectionId===undefined?{}:{defaultConnectionId:args.defaultConnectionId}),workflow:args.stages,program:args.program},this.agents.map(agent=>agent.id),'group');
        if(team.program)team.program.args=programArguments(team.program,team.program.args,{requireAll:true});
        for(const artifactId of team.workflow.flatMap(stage=>stage.inputArtifactIds??[]))if(this.artifactLookup?.(artifactId)?.taskId!==this.taskId)throw new HttpError(403,'只能复用当前任务已收录的成果。','team_artifact_scope');
        const decision=await this.requestPlan({title:args.title.trim(),team,runId:this.runId});
        this.limits=teamLimits(this.read().team);
        if(decision.status==='confirmed'){
          this.managed=true;
          this.update(task=>{task.teamRuns.find(run=>run.id===this.runId).execution='scheduled';});
          const execution=await this.executeApproved();
          return response({...decision,execution,instruction:'用户已经确认，运行系统已按确认的依赖、模型和并发执行。不要再次等待确认或重复派工。请检查实际结果和文件后汇总；若有失败，说明原因和未完成步骤。'});
        }
        return response(decision);
      }
      if(tool==='team_status'){if(Object.keys(args).length)throw new HttpError(400,'团队状态查询不接受参数。');return response(this.snapshot());}
      if(tool==='team_wait'){
        if(Object.keys(args).some(key=>key!=='nodeIds')||!Array.isArray(args.nodeIds)||!args.nodeIds.length||args.nodeIds.length>=this.limits.nodes||args.nodeIds.some(key=>typeof key!=='string'||!this.work.has(key)))throw new HttpError(400,'只能等待当前团队中已派发的任务。','team_node_not_found');
        await Promise.all([...new Set(args.nodeIds)].map(key=>this.work.get(key)));
        for(const nodeId of args.nodeIds)this.collected.add(nodeId);
        return response({nodes:this.snapshot().nodes.filter(node=>args.nodeIds.includes(node.id))});
      }
      if(tool!=='team_delegate'||Object.keys(args).some(key=>!['agentId','task','stageId','artifactIds'].includes(key))||typeof args.task!=='string'||!args.task.trim()||args.task.length>12000||args.stageId!==undefined&&typeof args.stageId!=='string')throw new HttpError(400,'团队任务参数无效。','team_arguments');
      if(args.artifactIds!==undefined&&(!Array.isArray(args.artifactIds)||args.artifactIds.length>12||args.artifactIds.some(id=>typeof id!=='string'||this.artifactLookup?.(id)?.taskId!==this.taskId)))throw new HttpError(403,'只能交接当前任务已收录的成果。','team_artifact_scope');
      if(this.read().team?.reviewBeforeRun&&!this.read().workflowPlans?.some(plan=>plan.runId===this.runId&&plan.status==='confirmed'))throw new HttpError(409,'请先提交并确认本次工作流。','workflow_not_confirmed');
      if(this.read().workflowPlans?.some(plan=>plan.runId===this.runId&&['pending','rejected','revision_requested'].includes(plan.status))&&!this.read().workflowPlans?.some(plan=>plan.runId===this.runId&&plan.status==='confirmed'))throw new HttpError(409,'工作流尚未确认，请根据反馈调整方案。','workflow_not_confirmed');
      const run=this.snapshot(),agent=this.agents.find(agent=>agent.id===args.agentId&&agent.id!==run.leadAgentId);
      if(!agent)throw new HttpError(400,'只能派发给团队中已选择的其他专家。','team_agent_invalid');
      const workflow=this.read().team?.workflow??[],stage=workflow.find(item=>item.id===args.stageId);
      if(workflow.length&&(!stage||!stage.agentIds.includes(agent.id)))throw new HttpError(400,'请指定此成员所属的流程阶段。','team_stage_invalid');
      if(this.managed&&!scheduled){const existing=latestWorkflowNode(run,stage?.id,agent.id);if(existing)return response({nodeId:existing.id,status:existing.status,alreadyAssigned:true});throw new HttpError(409,'确认后的阶段由运行系统派发，当前阶段尚未满足依赖。','workflow_managed');}
      if(stage?.after.some(id=>!this.stageComplete(workflow.find(item=>item.id===id))))throw new HttpError(409,'先完成并收齐前置阶段的成果，再派发当前阶段。','team_stage_pending');
      if(stage&&run.nodes.some(node=>node.stageId===stage.id&&node.agentId===agent.id&&(!stepKey||node.stepKey===stepKey)&&active.has(node.status)))throw new HttpError(409,'这项分工正在执行，请等待当前结果。','team_assignment_active');
      if(run.nodes.length>=this.limits.nodes&&!run.nodes.some(node=>scheduled&&node.stageId===stage?.id&&node.agentId===agent.id&&node.stepKey===stepKey&&['interrupted','failed'].includes(node.status)))throw new HttpError(409,`本轮团队已达到 ${this.limits.nodes} 个执行节点上限。`,'team_node_limit');
      if(run.nodes.filter(node=>node.kind==='worker'&&active.has(node.status)).length>=this.limits.concurrency)throw new HttpError(409,`已有 ${this.limits.concurrency} 位专家在执行，请先等待其中一项结束。`,'team_concurrency_limit');
      const previous=scheduled?run.nodes.find(node=>node.kind==='worker'&&node.stageId===stage?.id&&node.agentId===agent.id&&node.stepKey===stepKey&&['interrupted','failed'].includes(node.status)):undefined;
      const node={...(previous?{attempts:[...(previous.attempts??[]),{status:previous.status,startedAt:previous.startedAt,finishedAt:previous.finishedAt,error:previous.error}]}:{}),id:previous?.id??id('team-node'),...(stepKey?{stepKey}:{}),parentId:this.leadNodeId,kind:'worker',agentId:agent.id,name:agent.name,role:agent.role,objective:args.task.trim(),...(stage?{stageId:stage.id}:{}),...(args.artifactIds?.length?{inputArtifactIds:[...new Set(args.artifactIds)]}:{}),status:'queued',createdAt:now()};
      this.update(task=>{const nodes=task.teamRuns.find(run=>run.id===this.runId).nodes;if(previous){const index=nodes.findIndex(item=>item.id===previous.id);nodes[index]={...node,attempts:[...(previous.attempts??[]),{status:previous.status,startedAt:previous.startedAt,finishedAt:previous.finishedAt,error:previous.error}]};}else nodes.push(node);});
      const promise=Promise.resolve().then(async()=>{
        if(this.signal.aborted)throw Object.assign(new Error('团队任务已停止。'),{name:'AbortError'});
        this.node(node.id,{status:'running',startedAt:now()});
        const result=await this.runWorker(agent,node,(status)=>this.node(node.id,{status}));
        if(this.signal.aborted)throw Object.assign(new Error('团队任务已停止。'),{name:'AbortError'});
        this.node(node.id,{status:'completed',...this.result(result.text),...(result.handoff?{artifacts:result.handoff.artifacts.map(file=>({...file,contentHash:programHash(this.artifactLookup?.(file.id)?.content)})),handoffSkipped:result.handoff.skipped}:{}),finishedAt:now()});
      }).catch(error=>this.node(node.id,{status:this.signal.aborted||error.name==='AbortError'?'interrupted':'failed',error:this.cleanError(error.message),finishedAt:now()}));
      this.work.set(node.id,promise);
      return response({nodeId:node.id,status:'queued'});
    } catch(error){return response({error:this.cleanError(error.message),code:error.code??'team_error'},false);}
  }
  async executeApproved(){
    const program=this.snapshot().configuration?.program??this.read().team?.program;
    if(!program)return this.executeWorkflow();
    this.managed=true;this.stepQueue=[];this.stepRunning=0;
    this.replayOrder=(this.snapshot().steps??[]).filter(s=>s.status==='completed').sort((a,b)=>a.order-b.order).map(s=>s.key);this.replayWaiting=new Map();
    const result=await runProgram(program,{signal:this.signal,onStep:request=>this.programStep(request)});
    await Promise.all([...this.work.values()]);this.signal.throwIfAborted();
    if(this.stepQueue.length||this.stepRunning||this.replayOrder.length)throw new Error('流程脚本没有等待全部步骤，或恢复记录与脚本不一致。');
    this.update(task=>{task.teamRuns.find(r=>r.id===this.runId).programResult=result;});
    return {status:'completed',result,nodes:this.snapshot().nodes.filter(n=>n.kind==='worker')};
  }
  async programStep(request){
    this.signal.throwIfAborted();
    if(!request||Object.keys(request).some(k=>!['stageId','key','input'].includes(k))||typeof request.stageId!=='string'||request.input!==undefined&&(typeof request.input!=='string'||request.input.length>6000))throw new Error('脚本步骤参数无效。');
    const stage=this.read().team.workflow.find(s=>s.id===request.stageId),key=request.key??request.stageId;
    if(!stage||typeof key!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(key))throw new Error('脚本步骤必须引用已确认阶段，并使用有效的唯一键。');
    this.issuedKeys??=new Set();if(this.issuedKeys.has(key))throw new Error('脚本重复使用步骤键：'+key);this.issuedKeys.add(key);
    const hash=programHash({stageId:stage.id,input:request.input??''}),saved=this.snapshot().steps?.find(s=>s.key===key);
    if(saved&&saved.hash!==hash)throw new Error('步骤输入与恢复记录不同：'+key);
    if(saved?.status==='completed')return new Promise((resolve,reject)=>{this.replayWaiting.set(key,{resolve,reject,value:saved.value});this.drainReplay();});
    if((this.snapshot().steps?.length??0)>=72&&!saved)throw new Error('流程步骤超过 72 项。');
    this.update(task=>{const run=task.teamRuns.find(r=>r.id===this.runId);run.steps??=[];const step=run.steps.find(s=>s.key===key);if(step)step.status='running';else run.steps.push({key,stageId:stage.id,hash,status:'running'});});
    const nodes=await Promise.all(stage.agentIds.map(agentId=>this.withSlot(async()=>{
      const prior=this.snapshot().nodes.find(n=>n.stepKey===key&&n.agentId===agentId&&n.status==='completed');if(prior)return prior;
      const prerequisites=stage.after.flatMap(id=>this.read().team.workflow.find(s=>s.id===id).agentIds.flatMap(a=>workflowAssignmentNodes(this.snapshot(),id,a)));
      const artifactIds=[...new Set([...(stage.inputArtifactIds??[]),...prerequisites.flatMap(n=>n?.artifacts?.map(f=>f.id)??[])])];
      const objective=[stage.description,stage.expectedOutput?'预期成果：'+stage.expectedOutput:'',request.input?'本次脚本输入：'+request.input:'','流程参数：'+JSON.stringify(this.read().team.program.args)].filter(Boolean).join('\n\n');
      const reply=await this.call({tool:'team_delegate',arguments:{stageId:stage.id,agentId,task:objective,artifactIds}},{scheduled:true,stepKey:key});const value=JSON.parse(reply.contentItems[0].text);
      if(!reply.success)throw new Error(value.error);await this.work.get(value.nodeId);this.signal.throwIfAborted();this.collected.add(value.nodeId);
      const node=this.snapshot().nodes.find(n=>n.id===value.nodeId);if(node.status!=='completed')throw new Error(node.error||'成员任务未完成。');return node;
    })));
    const value={nodes:nodes.map(n=>({id:n.id,name:n.name,result:n.result})),results:nodes.map(n=>n.result),artifacts:nodes.flatMap(n=>n.artifacts??[])};
    this.update(task=>{const run=task.teamRuns.find(r=>r.id===this.runId),step=run.steps.find(s=>s.key===key);Object.assign(step,{status:'completed',value,order:1+Math.max(0,...run.steps.map(s=>s.order??0))});});return value;
  }
  drainReplay(){
    if(this.replayDraining||!this.replayWaiting.has(this.replayOrder[0]))return;
    this.replayDraining=true;const key=this.replayOrder.shift(),entry=this.replayWaiting.get(key);this.replayWaiting.delete(key);entry.resolve(entry.value);
    // Separate deliveries across event-loop turns: async promise adoption must not
    // reorder cached results observed by Promise.race in the script cell.
    setImmediate(()=>{this.replayDraining=false;this.drainReplay();});
  }
  async withSlot(fn){
    if(this.stepRunning>=this.limits.concurrency)await new Promise((resolve,reject)=>{const abort=()=>reject(Object.assign(new Error('流程已停止。'),{name:'AbortError'}));this.signal.addEventListener('abort',abort,{once:true});this.stepQueue.push(()=>{this.signal.removeEventListener('abort',abort);resolve();});});
    this.signal.throwIfAborted();this.stepRunning++;try{return await fn();}finally{this.stepRunning--;this.stepQueue.shift()?.();}
  }
  /** Confirmation dispatches the approved DAG; no second model decision is required. */
  async executeWorkflow(){
    const pending=new Map(this.read().team.workflow.flatMap(stage=>stage.agentIds.filter(agentId=>latestWorkflowNode(this.snapshot(),stage.id,agentId)?.status!=='completed').map(agentId=>[`${stage.id}:${agentId}`,{stageId:stage.id,agentId}])));
    const running=new Map();
    while(pending.size||running.size){
      this.signal.throwIfAborted();
      const task=this.read(),stages=task.team.workflow;
      for(const [key,assignment] of pending){
        if(running.size>=this.limits.concurrency)break;
        const stage=stages.find(item=>item.id===assignment.stageId);
        if(stage.after.some(id=>!this.stageComplete(stages.find(item=>item.id===id))))continue;
        const prerequisites=stage.after.flatMap(id=>stages.find(item=>item.id===id).agentIds.map(agentId=>latestWorkflowNode(this.snapshot(),id,agentId)));
        const artifactIds=[...new Set([...(stage.inputArtifactIds??[]),...prerequisites.flatMap(node=>node.artifacts?.map(file=>file.id)??[])])];
        if(artifactIds.length>12)throw new HttpError(413,'这一阶段收到的前序文件超过 12 个，请拆分阶段。','team_artifact_limit');
        const clip=(text,limit)=>text.length>limit?text.slice(0,limit)+'\n[内容节选，完整文件见交接输入]':text;
        const recent=task.messages.filter(item=>item.role==='user').at(-1)?.content??'';
        const objective=[`已确认的分工：${stage.title}`,stage.description,stage.expectedOutput?`预期成果：${stage.expectedOutput}`:'',`原始任务与材料：\n${clip(task.prompt??'',5000)}`,recent!==task.prompt?`本轮补充要求：\n${clip(recent,2000)}`:'',prerequisites.length?'前序结果（文件以只读输入提供）：\n'+prerequisites.map(node=>`${node.name}：${clip(node.result??'',2000)}`).join('\n\n'):''].filter(Boolean).join('\n\n');
        // The approved description and expected output stay complete; extra context is bounded.
        const result=await this.call({tool:'team_delegate',arguments:{agentId:assignment.agentId,stageId:stage.id,task:clip(objective,12000-28),artifactIds}},{scheduled:true});
        const value=JSON.parse(result.contentItems[0].text);
        if(!result.success)throw new HttpError(409,value.error,value.code);
        pending.delete(key);
        running.set(value.nodeId,this.work.get(value.nodeId).then(()=>value.nodeId));
      }
      if(!running.size)break; // Remaining assignments are blocked by an actual failed prerequisite.
      const nodeId=await Promise.race(running.values());running.delete(nodeId);this.collected.add(nodeId);
    }
    const run=this.snapshot(),blocked=[...new Set([...pending.values()].map(item=>item.stageId))];
    this.update(task=>{task.teamRuns.find(item=>item.id===this.runId).blockedStageIds=blocked;});
    return {status:blocked.length||run.nodes.some(node=>node.kind==='worker'&&node.status!=='completed')?'incomplete':'completed',nodes:run.nodes.filter(node=>node.kind==='worker'),blockedStageIds:blocked};
  }
  finish(result) {
    const run=this.snapshot();
    if(run.nodes.some(node=>node.kind==='worker'&&(active.has(node.status)||!this.collected.has(node.id))))throw new HttpError(409,'负责人尚未收齐团队结果，本轮不能标记完成。','team_uncollected');
    // A saved workflow is a template, not an instruction to dispatch before
    // the lead has gathered this run's inputs and obtained confirmation.
    const template=this.read().team?.program;
    const missingInputs=template?.parameters.some(parameter=>parameter.required&&(template.args[parameter.name]??parameter.default)===undefined);
    const conversation=missingInputs&&!run.workflowPlanId&&!run.nodes.some(node=>node.kind==='worker');
    if(conversation){
      this.closed=true;this.node(this.leadNodeId,{status:'completed',...this.result(result),finishedAt:now()});
      this.update(task=>Object.assign(task.teamRuns.find(item=>item.id===this.runId),{status:'completed',execution:'conversation',finishedAt:now()}));
      return {needsInput:true};
    }
    const plan=this.read().workflowPlans?.find(item=>item.id===run.workflowPlanId),notRun=plan&&['rejected','revision_requested'].includes(plan.status)&&!run.nodes.some(node=>node.kind==='worker');
    const incomplete=(notRun?[]:this.read().team?.workflow??[]).filter(stage=>stage.required&&!this.stageComplete(stage));
    if(incomplete.length)throw new HttpError(409,`团队流程尚未完成：${incomplete.map(stage=>stage.title).join('、')}。`,'team_workflow_incomplete');
    this.closed=true;this.node(this.leadNodeId,{status:'completed',...this.result(result),finishedAt:now()});
    this.update(task=>Object.assign(task.teamRuns.find(run=>run.id===this.runId),{status:'completed',finishedAt:now()}));
  }
  async stop(status,error) {
    this.closed=true;await Promise.allSettled([...this.work.values()]);
    this.update(task=>{const run=task.teamRuns.find(run=>run.id===this.runId);if(!run||!active.has(run.status))return;run.status=status;run.finishedAt=now();for(const node of run.nodes)if(active.has(node.status))Object.assign(node,{status,error:this.cleanError(error),finishedAt:now()});});
  }
}
