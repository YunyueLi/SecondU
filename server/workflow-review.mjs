import {programArguments,programHash} from './workflow-program.mjs';
import {randomUUID} from 'node:crypto';
import {HttpError} from './http-error.mjs';
import {teamConfiguration,teamLimits,assertTeamProvider} from './team-runs.mjs';

/** A review pauses this live tool call. A persisted draft never resumes itself. */
export function requestWorkflowReview(runner,taskId,record,{title,team,runId}) {
  if(record.workflowReview)throw new HttpError(409,'已有一份工作流等待确认。','workflow_review_pending');
  record.controller.signal.throwIfAborted();
  const plan={id:`workflow-${randomUUID()}`,runId,title,revision:0,team:structuredClone(team),status:'pending',createdAt:new Date().toISOString()};
  return new Promise((resolve,reject)=>{
    const finish=(value,error)=>{record.controller.signal.removeEventListener('abort',abort);delete record.workflowReview;error?reject(error):resolve(value);};
    const abort=()=>{runner.mutate(taskId,task=>{const saved=task.workflowPlans?.find(item=>item.id===plan.id);if(saved?.status==='pending')saved.status='interrupted';});finish(undefined,Object.assign(new Error('工作流确认已中断。'),{name:'AbortError'}));};
    record.workflowReview={planId:plan.id,finish};
    record.controller.signal.addEventListener('abort',abort,{once:true});
    runner.mutate(taskId,task=>{
      task.workflowPlans??=[];task.workflowPlans.push(plan);task.status='awaiting_approval';
      const run=task.teamRuns.find(item=>item.id===runId);run.status='awaiting_approval';run.title=title;run.workflowPlanId=plan.id;
      const lead=run.nodes.find(node=>node.kind==='lead');if(lead)lead.status='awaiting_approval';
    });
  });
}

function validateConnections(store,team,record){
  const ids=[team.defaultConnectionId,...(team.workflow??[]).flatMap(stage=>Object.values(stage.connectionIds??{}))].filter(Boolean);
  for(const stage of team.workflow??[])for(const agentId of stage.agentIds){if(stage.connectionIds?.[agentId]||team.defaultConnectionId)continue;const inherited=record.models.find(model=>model.agent.id===agentId);assertTeamProvider(inherited?.settings);if(!inherited?.apiKey)throw new HttpError(409,'部分成员尚未配置可用模型，请为工作流或成员选择模型。','workflow_model_unavailable');}
  for(const id of new Set(ids)){const settings=store.connection(id);assertTeamProvider(settings);if(!store.getKey(settings))throw new HttpError(409,'所选模型连接尚未添加密钥。','workflow_model_unavailable');}
}
export function controlWorkflow(runner,taskId,body){
  const record=runner.active.get(taskId),task=runner.store.require('tasks',taskId);
  if(!record?.teamCoordinator||record.controller.signal.aborted)throw new HttpError(409,'这轮工作流已结束，请在原对话中继续。','workflow_not_active');
  if(body.action==='model'){
    if(Object.keys(body).some(key=>!['action','runId','stageId','agentId','connectionId'].includes(key))||body.runId!==record.teamCoordinator.runId)throw new HttpError(409,'工作流已经更新，请刷新。','workflow_stale');
    const run=task.teamRuns.find(item=>item.id===body.runId),stage=task.team?.workflow?.find(item=>item.id===body.stageId);
    if(!stage?.agentIds.includes(body.agentId))throw new HttpError(400,'请指定本轮的阶段与成员。','workflow_model_invalid');
    if(run.nodes.some(node=>node.stageId===stage.id&&node.agentId===body.agentId))throw new HttpError(409,'这项分工已经派发，模型只能在开始前调整。','workflow_node_started');
    const connectionIds={...stage.connectionIds};if(body.connectionId==null||body.connectionId==='')delete connectionIds[body.agentId];else connectionIds[body.agentId]=body.connectionId;
    const team=teamConfiguration({...task.team,workflow:task.team.workflow.map(item=>item.id===stage.id?{...item,connectionIds}:item)},task.agentIds,'group');validateConnections(runner.store,team,record);
    runner.mutate(taskId,current=>{current.team=team;const saved=current.teamRuns.find(item=>item.id===run.id);saved.workflow=structuredClone(team.workflow);saved.configuration=structuredClone(team);saved.configurationHash=programHash(team);for(const id of Object.values(connectionIds)){const settings=runner.store.connection(id);saved.modelBindings??={};saved.modelBindings[id]={model:settings.model,provider:settings.provider,baseUrl:settings.baseUrl,revision:settings.revision,api:settings.api};}});return runner.store.require('tasks',taskId);
  }
  if(body.action==='concurrency'){
    if(Object.keys(body).some(key=>!['action','runId','concurrency'].includes(key))||body.runId!==record.teamCoordinator.runId)throw new HttpError(409,'工作流已经更新，请刷新。','workflow_stale');
    const team=teamConfiguration({...task.team,concurrency:body.concurrency},task.agentIds,'group');
    runner.mutate(taskId,current=>{current.team=team;const run=current.teamRuns.find(item=>item.id===body.runId);run.limits=teamLimits(team);if(run.configuration){run.configuration=structuredClone(team);run.configurationHash=programHash(team);}});
    record.teamCoordinator.limits=teamLimits(team);return runner.store.require('tasks',taskId);
  }
  const review=record.workflowReview,plan=task.workflowPlans?.find(item=>item.id===body.planId);
  if(!review||review.planId!==body.planId||plan?.status!=='pending'||body.revision!==plan.revision)throw new HttpError(409,'这份工作流已处理或失效，请刷新。','workflow_stale');
  if(Object.keys(body).some(key=>!['action','planId','defaultConnectionId','concurrency','stageConnections','feedback','revision'].includes(key))||!['confirm','configure','revise','reject'].includes(body.action))throw new HttpError(400,'工作流操作无效。','workflow_action_invalid');
  let team=plan.team;
  if(['confirm','configure'].includes(body.action)){
    const stageConnections=body.stageConnections??{};
    if(!stageConnections||typeof stageConnections!=='object'||Array.isArray(stageConnections)||Object.keys(stageConnections).some(id=>!team.workflow.some(stage=>stage.id===id)))throw new HttpError(400,'阶段模型设置无效。','workflow_model_invalid');
    team=teamConfiguration({...team,concurrency:body.concurrency??team.concurrency,defaultConnectionId:body.defaultConnectionId===undefined?team.defaultConnectionId:body.defaultConnectionId||undefined,workflow:team.workflow.map(stage=>({...stage,connectionIds:stageConnections[stage.id]??stage.connectionIds}))},task.agentIds,'group');
    if(body.action==='confirm'){validateConnections(runner.store,team,record);if(team.program)team.program.args=programArguments(team.program,team.program.args,{requireAll:true});}
    else validateConnections(runner.store,{...team,workflow:team.workflow.map(stage=>({...stage,agentIds:[],connectionIds:stage.connectionIds}))},record);
  }
  if(body.action==='configure'){
    runner.mutate(taskId,current=>{const saved=current.workflowPlans.find(item=>item.id===plan.id);saved.team=team;saved.revision++;});return runner.store.require('tasks',taskId);
  }
  const feedback=body.feedback??'';
  if(typeof feedback!=='string'||feedback.length>6000||body.action==='revise'&&!feedback.trim())throw new HttpError(400,'请填写修改要求（最多 6,000 字符）。','workflow_feedback_invalid');
  const status={confirm:'confirmed',revise:'revision_requested',reject:'rejected'}[body.action];
  runner.mutate(taskId,current=>{
    const saved=current.workflowPlans.find(item=>item.id===plan.id);Object.assign(saved,{status,team,feedback:feedback.trim()});
    const run=current.teamRuns.find(item=>item.id===plan.runId);run.status='running';
    const lead=run.nodes.find(node=>node.kind==='lead');if(lead)lead.status='running';current.status='running';
    if(status==='confirmed'){current.team=team;Object.assign(run,{title:plan.title,workflow:structuredClone(team.workflow),defaultConnectionId:team.defaultConnectionId,limits:teamLimits(team),workflowPlanId:plan.id,configuration:structuredClone(team),configurationHash:programHash(team),inputSnapshots:team.workflow.flatMap(stage=>stage.inputArtifactIds??[]).map(id=>{const file=runner.store.require('artifacts',id);return {id,version:file.version,hash:programHash(file.content)};}),agentSnapshots:structuredClone(record.availableAgents),modelBindings:Object.fromEntries([...new Set([team.defaultConnectionId,...team.workflow.flatMap(stage=>Object.values(stage.connectionIds??{})),...record.models.map(m=>m.settings.id)].filter(Boolean))].map(id=>{const settings=runner.store.connection(id);return [id,{model:settings.model,provider:settings.provider,baseUrl:settings.baseUrl,revision:settings.revision,api:settings.api}];})),inputMessageId:current.messages.filter(m=>m.role==='user').at(-1)?.id});}
  });
  record.teamCoordinator.limits=teamLimits(team);
  review.finish({status,feedback:feedback.trim(),...(status==='confirmed'?{team}:{})});
  return runner.store.require('tasks',taskId);
}
