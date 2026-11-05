import {stringify} from 'yaml';
import {HttpError} from '../http-error.mjs';
import {sensitiveWorkspaceContent} from '../workspace-files.mjs';
import {digest,inspectPackage,encodeArchive} from './package.mjs';

/** Export authored definitions and dependency identities, never account/source bindings. */
export function exportDefinition(service,store,{kind,id,metadata={},expectedDigest}={}){
 if(!['expert','team'].includes(kind)||typeof id!=='string')throw new HttpError(400,'请选择专家或专家团。','expert_export_invalid');
 const room=kind==='team'?store.require('agentRooms',id):undefined;
 if(room&&!room.team)throw new HttpError(400,'此会话还没有配置专家团。','expert_export_invalid');
 const agents=room?[room.team.leadAgentId,...room.agentIds.filter(key=>key!==room.team.leadAgentId)].map(key=>store.require('agents',key)):[store.require('agents',id)];
 const snapshot=service.snapshot(),skillIds=[...new Set(agents.flatMap(agent=>agent.capabilities?.skillIds??[]))];
 const skills=skillIds.map(key=>snapshot.skills.find(skill=>skill.id===key));
 if(skills.some(skill=>!skill))throw new HttpError(409,'所选专家的技能依赖已改变，请检查专业能力配置。','expert_export_dependency');
 const text=(value,fallback,max)=>{const result=value===undefined?fallback:value;if(typeof result!=='string'||!result.trim()||result.length>max)throw new HttpError(400,'导出名称、版本或说明无效。','expert_export_invalid');return result.trim();};
 const packageId=`secondu-${kind}-${digest(id).slice(0,16)}`,names=new Map(agents.map((agent,index)=>[agent.id,`expert-${index+1}`]));
 const dependencies=skills.map(skill=>{const pack=snapshot.packages.find(item=>item.id===skill.packageId);return {id:skill.id,version:skill.version,digest:skill.digest,license:skill.license??pack.license??'unspecified',...(pack.upstream?{upstream:pack.upstream}:{}),...(pack.source.kind==='github'?{source:pack.source}:{})};});
 const connectorNames=[...new Set(agents.flatMap(agent=>agent.capabilities?.requiredConnectors??[]))];
 const manifest={name:packageId,displayName:text(metadata.name,room?.title||agents[0].name,200),description:text(metadata.description,room?`${room.title}：${agents.map(agent=>agent.role||agent.name).join('；')}`:agents[0].role||agents[0].name,2000),version:text(metadata.version,'1.0.0',80),license:text(metadata.license,'UNLICENSED',100),...(metadata.author?{author:{name:text(metadata.author,'',200)}}:{}),expertType:kind==='team'?'team':'agent',agentName:names.get(agents[0].id),agents:['./agents'],dependencies:{skills:dependencies,connectors:connectorNames},secondu:{experts:Object.fromEntries(agents.filter(agent=>agent.capabilities?.outputContract).map(agent=>[names.get(agent.id),{outputContract:agent.capabilities.outputContract}]))}};
 if(room){manifest.teamInfo={leadAgent:names.get(room.team.leadAgentId),memberAgents:room.agentIds.filter(key=>key!==room.team.leadAgentId).map(key=>names.get(key))};manifest.secondu.workflow=(room.team.workflow??[]).map(stage=>({id:stage.id,title:stage.title,description:stage.description,members:stage.agentIds.map(key=>names.get(key)),after:stage.after,required:stage.required}));}
 const files={'plugin.json':Buffer.from(JSON.stringify(manifest,null,2)+'\n')};
 for(const agent of agents){const name=names.get(agent.id);files[`agents/${name}.md`]=Buffer.from(`---\n${stringify({name,displayName:agent.name,profession:agent.role,description:agent.role||agent.name,skills:agent.capabilities?.skillIds??[]})}---\n\n${agent.instructions||agent.role||agent.name}\n`);}
 files['README.md']=Buffer.from(`# ${manifest.displayName}\n\n${manifest.description}\n\nImport this package, then install or map its declared skill dependencies. Account credentials, local source bindings, model connections, task histories and personal files are not included.\n\n${dependencies.map(item=>`- ${item.id} @ ${item.version} (${item.digest})`).join('\n')}\n`);
 const secrets=Object.values(store.getKeys()).flatMap(value=>{try{return [value,...Object.values(JSON.parse(value)).filter(item=>typeof item==='string')];}catch{return [value];}});
 if(Object.values(files).some(value=>sensitiveWorkspaceContent(value.toString('utf8'),secrets)))throw new HttpError(400,'工作说明包含凭据，请先从专家说明中移除后再导出。','expert_export_sensitive');
 const inspected=inspectPackage(files),fingerprint=inspected.package.digest;
 if(expectedDigest!==undefined&&expectedDigest!==fingerprint)throw new HttpError(409,'专家配置已变化，请重新核对导出预览。','expert_export_stale');
 const preview={kind,id,name:manifest.displayName,digest:fingerprint,filename:`${packageId}.zip`,metadata:{name:manifest.displayName,description:manifest.description,version:manifest.version,license:manifest.license,author:metadata.author??''},experts:agents.map(agent=>({name:agent.name,role:agent.role,instructions:agent.instructions||agent.role||agent.name})),dependencies,stages:room?.team?.workflow??[],excluded:{sources:agents.reduce((sum,agent)=>sum+(agent.capabilities?.sourceIds.length??0),0),connections:agents.reduce((sum,agent)=>sum+(agent.capabilities?.connectorIds.length??0),0)}};
 return {preview,files,bytes:()=>encodeArchive(files)};
}
