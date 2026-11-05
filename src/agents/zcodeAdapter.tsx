import {foldPhaseEdges,assignAirLanes} from './zcode/components/workflow-timeline/timeline-bands';
import type {AgentProfile,Artifact,Bootstrap,Task,TeamRun,TeamWorkflowStage,TaskStatus} from '../../shared/contracts';
import {RichText} from '../components';
import {artifactDisplayName} from '../artifacts/format.mjs';
import {latestStageNode,stageStatus,workflowModel} from './workflowModel';
import {workflowTimeline} from './workflowTimeline';
import type {WorkflowTimelineModel,TimelinePill,TimelineInk} from './zcode/components/workflow-timeline/timeline-model';
import type {WorkflowRunState} from './zcode/protocol';
import type {WorkflowCompletionArtifact} from './zcode/components/workflow-timeline/WorkflowArtifactTile';
import type {WorkflowCausalityGraphData} from './zcode/components/workflow-graph/types';
import './zcode/host.css';
export const zcodeStepStatus=(status?:TaskStatus)=>status==='completed'?'done':status==='running'||status==='awaiting_approval'?'running':status==='failed'||status==='cancelled'||status==='interrupted'?'failed':'pending';
export const zcodeRunStatus=(status:TaskStatus):WorkflowRunState['status']=>status==='completed'?'completed':status==='running'||status==='awaiting_approval'?'running':status==='failed'?'errored':status==='interrupted'||status==='cancelled'?'stopped':'pending';
/** One view model supplies the unchanged upstream horizontal and vertical renderers. */
export function zcodeWorkflow(stages:TeamWorkflowStage[],agents:AgentProfile[],run?:TeamRun,task?:Task,data?:Bootstrap){
  const geometry=workflowTimeline(stages);
  const selections=new Map<string,{stageId:string;agentId:string;nodeId?:string}>();
  const stations:WorkflowTimelineModel['stations']=stages.map((stage,index)=>{
    const nodes=run?.nodes.filter(n=>n.kind==='worker'&&n.stageId===stage.id)??[];
    const pills:TimelinePill[]=stage.agentIds.flatMap(id=>{
      // Repeated script calls remain distinct instances; never fold their transcripts together.
      const instances=nodes.filter(n=>n.agentId===id);
      return (instances.length?instances:[undefined]).map((node,ordinal)=>{
        const siteId=`${stage.id}:${id}`,key=`${siteId}@${ordinal+1}`,agent=agents.find(a=>a.id===id),name=agent?.name??node?.name??id;
        selections.set(key,{stageId:stage.id,agentId:id,nodeId:node?.id});
        return {key,lane:{id, name,laneClass:'agent' as const},laneClass:'agent' as const,runtimeName:name,avatarIndex:Math.max(0,agents.findIndex(a=>a.id===id)),status:run?zcodeStepStatus(node?.status):undefined,slot:{siteId,ordinal:ordinal+1},instance:node?{siteId,ordinal:ordinal+1,sessionId:node.id}:undefined,stepIds:[]};
      });
    });
    return {id:stage.id,naming:{id:stage.id,name:stage.title},pills,status:run?zcodeStepStatus(stageStatus(run,stage)):undefined,onLoop:nodes.length>stage.agentIds.length,track:geometry.tracks[index],visited:nodes.length>0,rounds:Math.max(1,...stage.agentIds.map(id=>nodes.filter(n=>n.agentId===id).length)),fraction:run?{settled:nodes.filter(n=>['completed','failed','cancelled','interrupted'].includes(n.status)).length,observed:Math.max(nodes.length,stage.agentIds.length)}:undefined};
  });
  const ink=(to:number):TimelineInk=>stations[to].status==='running'?'march':stations[to].status==='done'||stations[to].status==='failed'?'strong':'faint';
  const folded=foldPhaseEdges(stages.length,geometry.bands,geometry.edges);
  const bands=folded.bands.map(band=>({...band,tracks:band.tracks.map(track=>({stations:track,entry:ink(track[0]),exit:ink(track.at(-1)!)}))}));
  const rails:WorkflowTimelineModel['rails']=folded.rails.map(rail=>({...rail,ink:ink(rail.to)}));
  const lanes=assignAirLanes(folded.arcs);
  const arcs:WorkflowTimelineModel['arcs']=folded.arcs.map((arc,index)=>({...arc,ink:ink(arc.to),lane:lanes[index]}));
  const model:WorkflowTimelineModel={stations,rails,arcs,bands,runningIndex:stations.reduce((last,s,i)=>s.status==='running'?i:last,-1)<0?undefined:stations.reduce((last,s,i)=>s.status==='running'?i:last,-1),live:!!run};
  const graph:WorkflowCausalityGraphData={steps:[],lanes:[],participants:[],handoffs:[],phases:[],phaseEdges:[]};
  const projected:WorkflowRunState|undefined=run?{runId:run.id,lastEventSequence:0,status:zcodeRunStatus(run.status),usage:{spentTokens:0,nodesUsed:0},actors:stations.flatMap(s=>s.pills.map(p=>{const selection=selections.get(p.key)!,stage=stages.find(s=>s.id===selection.stageId)!,node=run.nodes.find(n=>n.id===selection.nodeId),m=node?.model??(task&&data?workflowModel(task,run,stage,selection.agentId,data):undefined);return {siteId:p.slot!.siteId,ordinal:p.slot!.ordinal,name:p.runtimeName,sessionId:node?.id,status:p.status==='running'?'running':p.status==='done'||p.status==='failed'?'completed':'waiting',model:m?.model?`${m.provider}/${m.model}`:undefined};})),nodes:[]}:undefined;
  return {model,graph,run:projected,selections,dependencies:geometry.edges};
}
export function zcodeArtifacts(files:Artifact[],primaryId?:string):WorkflowCompletionArtifact[]{return files.map(f=>({id:f.id,title:artifactDisplayName(f).replace(/\.(md|markdown)$/i,''),kind:f.type==='markdown'?'markdown':'file',version:f.version,bytes:f.size??(f.encoding==='data-url'?undefined:new TextEncoder().encode(f.content).byteLength),contentType:f.type==='markdown'?'text/markdown':f.type==='html'?'text/html':'text/plain',sourcePath:f.name,primary:f.id===primaryId?true:undefined}));}
export function zcodeArtifactPreview(file?:Artifact){return file&&file.encoding!=='data-url'&&file.content?<div className="wf-preview-doc">{file.type==='markdown'?<RichText>{file.content.slice(0,2000)}</RichText>:<pre>{file.content.slice(0,2000)}</pre>}</div>:undefined;}
