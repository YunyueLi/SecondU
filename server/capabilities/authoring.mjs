import path from 'node:path';
import {mkdirSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {HttpError,now} from '../store.mjs';
import {directoryFiles,inspectPackage,filesDigest,safePath} from './package.mjs';
import {sensitiveWorkspaceContent} from '../workspace-files.mjs';

export const AUTHORING_TOOL={type:'function',name:'secondu_submit_capability_draft',description:'Validate and save an expert, expert-team or skill package as a reviewable local draft. Does not install, create agents, grant permissions, connect accounts or execute any bundled script. Invalid packages return actionable errors.',inputSchema:{type:'object',properties:{summary:{type:'string',maxLength:2000},files:{type:'array',minItems:1,maxItems:60,items:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content'],additionalProperties:false}}},required:['summary','files'],additionalProperties:false}};
export function authoringContext(service,task){
 if(!task.capabilityAuthoring)return '';
 const skills=service.snapshot().skills.filter(skill=>skill.enabled).map(({id,description})=>({id,description}));
 const guide={kind:task.capabilityAuthoring.kind,format:{manifest:'plugin.json',agentFiles:'agents/<lowercase-name>.md',skillFiles:'skills/<lowercase-name>/SKILL.md'},manifestExample:{name:'my-specialist',version:'1.0.0',displayName:'User-facing name',description:'Specific purpose',license:'UNLICENSED',expertType:'agent',agentName:'specialist',agents:['./agents']},agentFrontmatter:{name:'specialist',displayName:'User-facing name',profession:'Role',description:'When to use this expert',skills:['installed-package/skill-name']},team:{expertType:'team',teamInfo:{leadAgent:'lead',memberAgents:['researcher','reviewer']},secondu:{workflow:[{id:'research',title:'Research',description:'Inputs, steps, outputs and evidence checks',members:['researcher'],after:[],required:true},{id:'review',title:'Review',description:'Independently check the actual output',members:['reviewer'],after:['research'],required:true}]}},skill:{frontmatter:{name:'specific-method',description:'When to use and expected deliverable',license:'UNLICENSED'},body:'Concrete inputs, working steps, output contract, failure conditions and verification. Use references/scripts only if included and necessary.'},installedSkills:skills,baseDefinition:task.capabilityAuthoring.baseFiles??null};
 return '本轮任务是设计可复用的专业能力包。你必须依据用户的使用场景澄清必要信息，形成明确的方法、输入、交付物、检验标准和限制。引用已安装技能的完整 ID，不虚构工具、经验、来源或完成记录。新写脚本必须说明用途和依赖，不能包含凭据、机器路径或私人资料。创建专家团时定义负责人、成员和阶段；阶段成员不包含负责人，依赖必须出现在前面。不得修改用户原有专家；只能调用 secondu_submit_capability_draft 保存待审稿。保存成功后说明内容与待配置项。信息不足时可提问；不能假称已生成或安装。用户可以在本对话继续修改，重新提交会保留草稿版本。\n'+JSON.stringify(guide);
}
export function submitCapabilityDraft(service,task,args){
 if(!task.capabilityAuthoring||!args||typeof args.summary!=='string'||args.summary.length>2000||!Array.isArray(args.files)||!args.files.length||args.files.length>60)throw new HttpError(400,'能力草稿格式无效。','capability_draft_invalid');
 const files=Object.create(null);let size=0;
 const secrets=Object.values(service.store.getKeys()).flatMap(value=>{try{return [value,...Object.values(JSON.parse(value)).filter(item=>typeof item==='string')];}catch{return [value];}});
 if(sensitiveWorkspaceContent(args.summary,secrets))throw new HttpError(400,'草稿摘要含凭据信息，未保存。','capability_draft_sensitive');
 for(const file of args.files){if(!file||typeof file.content!=='string'||file.content.length>100000||(size+=Buffer.byteLength(file.content))>512000)throw new HttpError(400,'能力草稿超出文件大小限制。','capability_draft_invalid');const name=safePath(file.path);if(files[name])throw new HttpError(400,'能力草稿含重复文件。','capability_draft_invalid');if(sensitiveWorkspaceContent(file.content,secrets))throw new HttpError(400,'能力草稿含凭据信息，未保存。','capability_draft_sensitive');files[name]=Buffer.from(file.content);}
 const inspected=inspectPackage(files,{source:{kind:'generated',label:'SecondU draft'}}),pack=inspected.package,kind=task.capabilityAuthoring.kind;
 if(kind==='team'&&!pack.teams.length||kind==='expert'&&(!pack.experts.length||pack.teams.length)||kind==='skill'&&!pack.skills.length)throw new HttpError(400,'草稿内容与请求的能力类型不符。','capability_draft_kind');
 const previous=service.store.get('capabilityDrafts',task.id),parent=path.join(service.root,'drafts',task.id),root=path.join(parent,pack.digest);mkdirSync(parent,{recursive:true,mode:0o700});
 if(!existsSync(root)){const stage=path.join(parent,`.staging-${randomUUID()}`);mkdirSync(stage,{mode:0o700});for(const [name,bytes] of Object.entries(files)){const file=path.join(stage,name);mkdirSync(path.dirname(file),{recursive:true,mode:0o700});writeFileSync(file,bytes,{mode:0o600,flag:'wx'});}renameSync(stage,root);}else if(filesDigest(directoryFiles(root))!==pack.digest)throw new HttpError(409,'同版本草稿文件已变化，未覆盖。','capability_integrity');
 const draft={id:task.id,taskId:task.id,kind,summary:args.summary,digest:pack.digest,package:pack,createdAt:previous?.createdAt??now(),updatedAt:now(),versions:[...(previous?.versions??[]),{digest:pack.digest,createdAt:now()}].filter((item,index,all)=>all.findIndex(other=>other.digest===item.digest)===index)};
 service.store.put('capabilityDrafts',draft);return {id:draft.id,name:pack.name,digest:pack.digest,experts:pack.experts.length,teams:pack.teams.length,skills:pack.skills.length,warnings:pack.warnings,status:'pending_review'};
}
export function previewCapabilityDraft(service,taskId){
 const draft=service.store.require('capabilityDrafts',taskId),files=directoryFiles(path.join(service.root,'drafts',taskId,draft.digest));if(filesDigest(files)!==draft.digest)throw new HttpError(409,'能力草稿文件已变化，未导入。','capability_integrity');
 const installed=service.records().find(pack=>pack.id===draft.package.id);return service.previewFiles(files,{kind:'generated',label:'SecondU draft'},installed?{existingId:installed.id}:{});
}
