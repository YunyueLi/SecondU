import {workflowStageStatus,workflowAssignmentNodes} from '../../shared/workflow-state.mjs';
import type {Task,TaskStatus,TeamRun,TeamRunNode,TeamWorkflowStage,Bootstrap,ModelConnection,ProviderSettings} from '../../shared/contracts';

export type WorkflowSelection={view?:'collaboration'|'graph';stageId:string;agentId?:string;runId?:string;nodeId?:string};
export type WorkflowModelSource='assignment'|'workflow'|'agent'|'conversation'|'default'|'recorded'|'unrecorded';
export type WorkflowModel={model:string;name:string;provider?:ProviderSettings['provider'];source:WorkflowModelSource;connection?:ModelConnection};

export function workflowStages(task:Task,run?:TeamRun):TeamWorkflowStage[]{
  const plan=task.workflowPlans?.find(item=>item.id===run?.workflowPlanId);
  const stages=(plan?.status==='pending'?plan.team.workflow:run?.workflow)??task.team?.workflow??[];
  if(stages.length)return stages;
  if(!run)return [];
  const workers=run.nodes.filter(node=>node.kind==='worker');
  return [{id:'assignments',title:'',description:'',agentIds:[...new Set((workers.length?workers:run.nodes).map(node=>node.agentId))],after:[],required:true}];
}
export function stageNodes(run:TeamRun|undefined,stage:TeamWorkflowStage){return run?.nodes.filter(node=>stage.id==='assignments'?stage.agentIds.includes(node.agentId):node.stageId===stage.id)??[];}
export function latestStageNode(run:TeamRun|undefined,stage:TeamWorkflowStage,agentId:string):TeamRunNode|undefined{const nodes=workflowAssignmentNodes(run,stage.id,agentId);return nodes.find(n=>['running','awaiting_approval','queued'].includes(n.status))??nodes.find(n=>['failed','interrupted'].includes(n.status))??stageNodes(run,stage).filter(node=>node.agentId===agentId).at(-1);}
export function stageStatus(run:TeamRun|undefined,stage:TeamWorkflowStage):TaskStatus{
  return stage.id==='assignments'?workflowStageStatus(run&&{...run,nodes:stageNodes(run,stage).map(node=>({...node,stageId:stage.id}))},stage):workflowStageStatus(run,stage);
}
/** Match dispatch precedence, while recorded assignments never borrow today's settings. */
export function workflowModel(task:Task,run:TeamRun|undefined,stage:TeamWorkflowStage,agentId:string,data:Pick<Bootstrap,'agents'|'modelConnections'|'defaultConnectionId'>,options:{inherit?:boolean;memberDefault?:boolean}={}):WorkflowModel{
  const node=latestStageNode(run,stage,agentId);
  if(node&&!options.inherit)return node.model?{...node.model,source:'recorded'}:{model:'',name:'',source:'unrecorded'};
  const plan=task.workflowPlans?.find(item=>item.id===run?.workflowPlanId);
  const teamDefault=options.memberDefault?undefined:plan?.status==='pending'?plan.team.defaultConnectionId:run?run.defaultConnectionId:task.team?.defaultConnectionId;
  const agent=data.agents.find(item=>item.id===agentId);
  const candidates:Array<[WorkflowModelSource,string|undefined]>=[['assignment',options.inherit?undefined:stage.connectionIds?.[agentId]],['workflow',teamDefault],['agent',agent?.connectionId],['conversation',task.connectionId],['default',data.defaultConnectionId]];
  const [source,id]=candidates.find(([,value])=>!!value)??['default',undefined];
  const recorded=run?.memberModels?.[agentId];
  if(recorded&&!['assignment','workflow'].includes(source))return {...recorded,source:recorded.source,connection:data.modelConnections.find(item=>item.id===recorded.connectionId)};
  const connection=data.modelConnections.find(item=>item.id===id);
  return {model:connection?.model??'',name:connection?.name??'',provider:connection?.provider,source,connection};
}
