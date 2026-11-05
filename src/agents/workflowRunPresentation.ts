import type {Artifact,TeamRun} from '../../shared/contracts';
export function workflowFiles(run:TeamRun,artifacts:Artifact[]){
  const ids=new Set([...(run.outputArtifactIds??[]),...run.nodes.flatMap(node=>node.artifacts?.map(file=>file.id)??[])]);
  return artifacts.filter(file=>ids.has(file.id));
}
export function workflowPrimaryFile(run:TeamRun):string|undefined{
  if(run.outputArtifactIds?.length===1)return run.outputArtifactIds[0];
  const result=run.programResult;
  if(!result||typeof result!=='object'||!('artifacts' in result)||!Array.isArray(result.artifacts)||result.artifacts.length!==1)return;
  const id=result.artifacts[0]?.id;
  return typeof id==='string'&&run.nodes.some(node=>node.artifacts?.some(file=>file.id===id))?id:undefined;
}
export function workflowRunModel(run:TeamRun){
  const models=[...new Set(run.nodes.filter(n=>n.kind==='worker').map(n=>n.model?.model).filter(Boolean))];
  if(models.length)return models.join(' / ');
  return [...new Set(Object.values(run.memberModels??{}).map(m=>m.model))].join(' / ');
}
