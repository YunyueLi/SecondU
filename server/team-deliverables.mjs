import path from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {workspaceFiles,sensitiveWorkspaceContent} from './workspace-files.mjs';
import {artifactBytes,binaryArtifactMime,encodeBinaryArtifact,BINARY_ARTIFACT_LIMIT,ARTIFACT_COLLECTION_LIMIT} from './artifact-content.mjs';
import {officeType,officeInspectionContent} from './office-content.mjs';
import {HttpError} from './http-error.mjs';

export function stageTeamInputs(store,taskId,node,workspace){
  mkdirSync(workspace,{recursive:true,mode:0o700});
  const inputs=[];let size=0;
  for(const id of node.inputArtifactIds??[]){
    const artifact=store.require('artifacts',id);
    if(artifact.taskId!==taskId)throw new HttpError(403,'只能交接当前任务已收录的成果。','team_artifact_scope');
    const {data}=artifactBytes(artifact);if((size+=data.length)>ARTIFACT_COLLECTION_LIMIT)throw new HttpError(413,'本次交接文件超过大小限制。','team_artifact_limit');
    const name=`inputs/${artifact.id}-${path.basename(artifact.name)}`,file=path.join(workspace,name);
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});writeFileSync(file,data,{flag:'wx',mode:0o400});
    inputs.push({artifactId:artifact.id,name:artifact.name,version:artifact.version,path:name});
  }
  return inputs;
}

/** Copy only validated deliverables into the parent task, with isolated names. */
export function collectTeamDeliverables(store,taskId,node,workspace,{runId,saveArtifact}){
  const artifacts=[],scan=workspaceFiles(workspace,{recursive:true});let bytes=0,skipped=0;
  const secrets=Object.values(store.getKeys()).flatMap(value=>{try{return [value,...Object.values(JSON.parse(value)).filter(item=>typeof item==='string')];}catch{return [value];}});
  const existingBytes=store.list('artifacts').filter(item=>item.taskId===taskId).reduce((sum,item)=>sum+(item.size??Buffer.byteLength(item.content??'')),0);
  for(const [relative] of scan.files){
    if(relative.startsWith('inputs/'))continue;
    const file=path.join(workspace,relative),stat=lstatSync(file),binary=!!binaryArtifactMime(relative);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>(binary?BINARY_ARTIFACT_LIMIT:1024*1024)||artifacts.length>=12||existingBytes+bytes+stat.size>ARTIFACT_COLLECTION_LIMIT){skipped++;continue;}
    const data=readFileSync(file);let content;
    try{content=binary?encodeBinaryArtifact(relative,data).content:new TextDecoder('utf-8',{fatal:true}).decode(data);if(!binary&&data.includes(0))throw new Error('Unsupported binary');}catch{skipped++;continue;}
    const inspect=officeType(relative)?officeInspectionContent(relative,data):[binary?data.toString('utf8'):content];
    if(inspect.some(value=>sensitiveWorkspaceContent(value,secrets))){skipped++;continue;}
    const name=`team-output-${runId.slice(-12)}/${node.id}/${node.attempts?.length?`attempt-${node.attempts.length+1}/`:''}${relative}`,root=store.taskWorkspace(taskId),target=path.join(root,name);
    // All ancestors in the generated destination are checked before writing.
    let current=root;
    for(const segment of path.dirname(name).split('/')){current=path.join(current,segment);try{const info=lstatSync(current);if(info.isSymbolicLink()||!info.isDirectory())throw new HttpError(409,'团队交付目录已被替换，未写入。','team_artifact_directory');}catch(error){if(error.code!=='ENOENT')throw error;mkdirSync(current,{mode:0o700});}}
    writeFileSync(target,data,{flag:'wx',mode:0o600});
    const artifact=saveArtifact(taskId,name,content,`${node.name}（待负责人复核）`,0,{pending:true,origin:'workspace'});
    store.put('artifacts',{...artifact,teamOrigin:{runId,nodeId:node.id,agentId:node.agentId,sourcePath:relative}});
    artifacts.push({id:artifact.id,name,path:name,version:artifact.version,size:data.length,reviewStatus:'pending'});bytes+=data.length;
  }
  return {artifacts,skipped,complete:scan.complete};
}
