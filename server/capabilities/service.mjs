import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readdirSync,mkdirSync,existsSync,writeFileSync,renameSync,accessSync,constants,statSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {HttpError,id,now} from '../store.mjs';
import {publicConnector} from '../connectors.mjs';
import {exportDefinition} from './export-definition.mjs';
import {archiveFiles,checkedFiles,directoryFiles,inspectPackage,filesDigest,fileChanges,encodeArchive,PACKAGE_LIMITS,safePath,digest,plain} from './package.mjs';

const BUILTIN=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../capabilities');
const require=createRequire(import.meta.url);
const services=new WeakMap();
export function capabilityService(store){let service=services.get(store);if(!service){service=new CapabilityService(store);services.set(store,service);}return service;}
const invalid=message=>{throw new HttpError(400,message,'capability_invalid');};
const list=(value,label,max=40)=>{if(!Array.isArray(value)||value.length>max||value.some(item=>typeof item!=='string'||item.length>200))invalid(`${label}无效。`);return [...new Set(value)];};
const strings=(value,label,max=12)=>list(value,label,max).map(value=>value.trim()).filter(Boolean);
const secretBinding=packageId=>({id:`capability:${packageId}`,provider:'local_skill',baseUrl:'local://capabilities'});
const protectedEnvironment=/^(?:HOME|USERPROFILE|CODEX_HOME|PATH|SHELL|ENV|BASH_ENV|NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONHOME|RUBYOPT|PERL5OPT|LD_.*|DYLD_.*|HITHER_.*|SECONDU_.*)$/;
function executable(name){
  if(!/^[a-zA-Z0-9_.+-]{1,100}$/.test(name))return false;
  const suffixes=process.platform==='win32'?['','.exe','.cmd']:[''];
  return (process.env.PATH??'').split(path.delimiter).filter(Boolean).some(dir=>suffixes.some(suffix=>{try{const file=path.join(dir,name+suffix);accessSync(file,constants.X_OK);return statSync(file).isFile();}catch{return false;}}));
}
async function limitedResponse(response,max){
  if(!response.ok)throw new HttpError(502,`能力来源返回 HTTP ${response.status}。`,'capability_download_failed');
  if(Number(response.headers.get('content-length'))>max)invalid('远程能力包超出大小限制。');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>max)invalid('远程能力包超出大小限制。');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}

export class CapabilityService {
  constructor(store,{builtinRoot=BUILTIN,fetchImpl=fetch}={}){
    this.store=store;this.root=path.join(store.directory,'capabilities');this.fetch=fetchImpl;this.previews=new Map();this.builtins=new Map();
    if(builtinRoot&&existsSync(builtinRoot)){const roots=existsSync(path.join(builtinRoot,'plugin.json'))?[builtinRoot]:readdirSync(builtinRoot,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>path.join(builtinRoot,entry.name));for(const root of roots){const inspected=inspectPackage(directoryFiles(root),{source:{kind:'builtin',label:'SecondU',url:'https://github.com/YunyueLi/SecondU'}});this.builtins.set(inspected.package.id,inspected);}}
  }
  records(){return [...this.builtins.values()].map(item=>item.package).concat(this.store.list('capabilityPackages'));}
  record(packageId){const record=this.builtins.get(packageId)?.package??this.store.get('capabilityPackages',packageId);if(!record)throw new HttpError(404,'能力包不存在。','capability_missing');return record;}
  environment(packageId){const text=this.store.getKey(secretBinding(packageId));if(!text)return {};try{const value=JSON.parse(text);return plain(value)?value:{};}catch{return {};}}
  check(requirement,record){
    let available=false,detail='';
    switch(requirement.kind){
      case 'binary':available=executable(requirement.name);detail=available?'已找到本机工具。':'需要安装本机工具。';break;
      case 'environment':available=!!this.environment(record.id)[requirement.name];detail=available?'已在当前空间配置。':'需要在当前空间配置凭据。';break;
      case 'platform':available=requirement.name===process.platform;detail=available?'符合当前系统。':'此技能要求其他操作系统。';break;
      case 'connector':available=this.store.list('connectors').some(item=>(item.catalogId===requirement.name||item.name===requirement.name||item.id===requirement.name)&&publicConnector(this.store,item).status==='ready');detail=available?'已连接可用服务；仍须绑定给专家或会话。':'需要连接对应服务。';break;
      // Package presence does not prove that a separately installed runtime can import it.
      case 'node-package':try{require.resolve(requirement.name);available=true;}catch{}detail=available?'应用依赖已安装。':'需要安装 Node.js 依赖。';break;
      case 'python-package':detail='需要在所选 Python 环境中检查依赖。';break;
    }
    return {...requirement,available,detail};
  }
  present(record){
    const settings=this.store.get('capabilitySettings',record.id)??{},enabled=settings.enabled??record.enabled;
    return {...record,enabled,skills:record.skills.map(skill=>{const active=enabled&&!(settings.disabledSkills??[]).includes(skill.id),checks=skill.requirements.map(req=>this.check(req,record));return {...skill,enabled:active,checks,status:!active?'disabled':checks.some(item=>!item.available&&!item.optional)?'needs_setup':'available'};})};
  }
  snapshot(){const packages=this.records().map(record=>this.present(record)),skills=packages.flatMap(item=>item.skills);return {packages,skills,experts:packages.filter(item=>item.enabled).flatMap(item=>(item.experts??[]).map(expert=>({...expert,skillIds:[...expert.skillIds,...expert.unresolvedSkills.filter(id=>skills.some(skill=>skill.id===id))],unresolvedSkills:expert.unresolvedSkills.filter(id=>!skills.some(skill=>skill.id===id))}))),teams:packages.filter(item=>item.enabled).flatMap(item=>item.teams??[]),archived:this.store.list('capabilityArchivedPackages').map(({id,name,version,archivedAt})=>({id,name,version,archivedAt}))};}
  files(record){
    const builtin=this.builtins.get(record.id);const files=builtin?.files??directoryFiles(path.join(this.root,'packages',record.id,record.digest));
    if(filesDigest(files)!==record.digest)throw new HttpError(409,'能力包文件已变化，请重新导入并检查后使用。','capability_integrity');return files;
  }
  previewFiles(files,source,{existingId}={}){
    for(const [key,value] of this.previews)if(value.expiresAt<Date.now())this.previews.delete(key);
    if(this.previews.size>=4)throw new HttpError(429,'请先完成或关闭已有的能力包导入。','capability_preview_limit');
    const current=existingId?this.record(existingId):undefined;
    if(current?.builtin)invalid('内置能力包随应用更新，不能用导入文件覆盖。');
    const inspected=inspectPackage(files,{source,packageId:current?.id});
    if(!current&&this.records().some(item=>item.id===inspected.package.id))throw new HttpError(409,'同名能力包已存在，请从该能力包选择更新。','capability_duplicate');
    const previewId=id('package-preview'),expiresAt=Date.now()+30*60*1000;
    const value={...inspected,previewId,expiresAt,existingId:current?.id,baseDigest:current?.digest,...(current?{changes:fileChanges(this.files(current),inspected.files)}:{})};this.previews.set(previewId,value);
    return {previewId,expiresAt:new Date(expiresAt).toISOString(),package:this.present(inspected.package),fileCount:Object.keys(files).length,size:Object.values(files).reduce((total,file)=>total+file.length,0),...(current?{existingId:current.id,changes:value.changes}:{})};
  }
  preview(body){
    let files;
    if(body.archiveBase64!==undefined){if(typeof body.archiveBase64!=='string'||body.archiveBase64.length>PACKAGE_LIMITS.archiveBytes*1.4||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.archiveBase64))invalid('ZIP 内容无效。');files=archiveFiles(Buffer.from(body.archiveBase64,'base64'));}
    else {if(!Array.isArray(body.files)||!body.files.length||body.files.length>PACKAGE_LIMITS.files)invalid('请选择技能目录或 ZIP 能力包。');const values=Object.create(null);for(const file of body.files){safePath(file.path);if(Object.hasOwn(values,file.path)||typeof file.content!=='string'||file.content.length>PACKAGE_LIMITS.fileBytes*1.4)invalid('能力包文件无效或重复。');values[file.path]=Buffer.from(file.content,file.encoding==='base64'?'base64':'utf8');}files=checkedFiles(values);}
    return this.previewFiles(files,{kind:'upload',label:typeof body.name==='string'?body.name.slice(0,200):'Local package'},{existingId:body.existingId});
  }
  async previewGitHub(body){
    let url;try{url=new URL(body.url);}catch{invalid('请输入公开 GitHub 仓库或子目录链接。');}
    if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash)invalid('来源须为不含凭据的公开 GitHub HTTPS 链接。');
    const parts=url.pathname.replace(/\/$/,'').split('/').filter(Boolean),[owner,repo]=parts;
    if(!/^[A-Za-z0-9_.-]+$/.test(owner??'')||!/^[A-Za-z0-9_.-]+$/.test(repo??'')||parts.length>2&&parts[2]!=='tree')invalid('GitHub 来源格式无效。');
    const ref=body.ref??parts[3]??'HEAD',subdir=body.path??parts.slice(4).join('/');
    if(typeof ref!=='string'||!ref||ref.length>200||/[\x00-\x1f]/.test(ref))invalid('仓库版本无效。');if(subdir)safePath(subdir);
    const request=(address)=>this.fetch(address,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'User-Agent':'SecondU-capability-import','Accept':'application/vnd.github+json'}});
    const commit=JSON.parse((await limitedResponse(await request(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`),128*1024)).toString('utf8'));
    if(!/^[a-f0-9]{40}$/.test(commit.sha??''))throw new HttpError(502,'无法确定仓库版本。','capability_source_revision');
    const archive=await limitedResponse(await request(`https://codeload.github.com/${owner}/${repo}/zip/${commit.sha}`),PACKAGE_LIMITS.archiveBytes);
    let files=archiveFiles(archive);if(subdir)files=checkedFiles(Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith(subdir+'/')).map(([name,bytes])=>[name.slice(subdir.length+1),bytes])));
    return this.previewFiles(files,{kind:'github',label:`${owner}/${repo}`,url:`https://github.com/${owner}/${repo}`,revision:commit.sha,...(subdir?{path:subdir}:{})},{existingId:body.existingId});
  }
  install({previewId}){
    const preview=this.previews.get(previewId);if(!preview||preview.expiresAt<Date.now())throw new HttpError(409,'导入预览已过期，请重新选择能力包。','capability_preview_expired');
    const current=preview.existingId?this.record(preview.existingId):undefined;
    if(current?.digest!==preview.baseDigest||!current&&this.records().some(item=>item.id===preview.package.id))throw new HttpError(409,'能力包已更新，请重新预览。','capability_version_conflict');
    const stamp=now(),record={...preview.package,installedAt:current?.installedAt??stamp,updatedAt:stamp,versions:[...(current?.versions??[]),{digest:preview.package.digest,version:preview.package.version,installedAt:stamp,source:preview.package.source}].filter((item,index,all)=>all.findIndex(other=>other.digest===item.digest)===index)};
    const parent=path.join(this.root,'packages',record.id);mkdirSync(parent,{recursive:true,mode:0o700});const destination=path.join(parent,record.digest);
    if(!existsSync(destination)){const stage=path.join(parent,`.staging-${randomUUID()}`);mkdirSync(stage,{mode:0o700});for(const [name,bytes] of Object.entries(preview.files)){const file=path.join(stage,safePath(name));mkdirSync(path.dirname(file),{recursive:true,mode:0o700});writeFileSync(file,bytes,{mode:0o600,flag:'wx'});}renameSync(stage,destination);}
    this.store.put('capabilityPackages',record);this.previews.delete(previewId);return this.present(record);
  }
  readFile(packageId,file,previewId){const preview=previewId?this.previews.get(previewId):undefined;if(previewId&&(!preview||preview.expiresAt<Date.now()))throw new HttpError(404,'导入预览已过期。','capability_preview_expired');const files=preview?.files??this.files(this.record(packageId));const bytes=files[safePath(file)];if(!bytes)throw new HttpError(404,'能力包文件不存在。','capability_file_missing');const content=bytes.toString('utf8');return {path:file,content:content.slice(0,80000),truncated:content.length>80000,size:bytes.length};}
  discard(previewId){this.previews.delete(previewId);return {ok:true};}
  configure(packageId,body){
    const record=this.record(packageId),old=this.store.get('capabilitySettings',packageId)??{id:packageId};const next={...old};
    if(body.enabled!==undefined){if(typeof body.enabled!=='boolean')invalid('启用状态无效。');next.enabled=body.enabled;}
    if(body.disabledSkills!==undefined){next.disabledSkills=list(body.disabledSkills,'技能列表',400);if(next.disabledSkills.some(key=>!record.skills.some(skill=>skill.id===key)))invalid('所选技能不属于此包。');}
    this.store.put('capabilitySettings',next);return this.present(record);
  }
  saveEnvironment(packageId,body){
    const record=this.record(packageId),allowed=new Set(record.skills.flatMap(skill=>skill.requirements.filter(req=>req.kind==='environment').map(req=>req.name)));
    if(!plain(body.values))invalid('凭据设置无效。');const values=this.environment(packageId);
    for(const [key,value] of Object.entries(body.values)){if(!allowed.has(key)||!/^[A-Z][A-Z0-9_]{0,99}$/.test(key)||protectedEnvironment.test(key)||typeof value!=='string'||value.length>10000)invalid('此环境变量不能由技能配置。');if(value)values[key]=value;else delete values[key];}
    this.store.credentialTransaction(()=>this.store.setKey(secretBinding(packageId),JSON.stringify(values)));return this.present(record);
  }
  rollback(packageId,body){
    const record=this.record(packageId);if(record.builtin)invalid('内置能力包随应用更新。');if(!record.versions.some(item=>item.digest===body.digest))invalid('找不到已安装的历史版本。');
    const files=directoryFiles(path.join(this.root,'packages',record.id,body.digest));if(filesDigest(files)!==body.digest)throw new HttpError(409,'历史能力包校验失败。','capability_integrity');
    const inspected=inspectPackage(files,{source:record.versions.find(item=>item.digest===body.digest)?.source??record.source,packageId:record.id});const next={...inspected.package,installedAt:record.installedAt,updatedAt:now(),versions:record.versions};this.store.put('capabilityPackages',next);return this.present(next);
  }
  remove(packageId){
    const record=this.record(packageId);if(record.builtin)invalid('内置能力包可以停用，不能移除。');
    const references=this.store.list('agents').filter(agent=>agent.capabilities?.packageId===packageId||agent.capabilities?.skillIds?.some(key=>key.startsWith(packageId+'/')));
    if(references.length)throw new HttpError(409,'仍有专家使用此能力包，请先调整专家的技能绑定或停用此包。','capability_in_use');
    // Preserve immutable files and installation history for task provenance and restore.
    this.store.transaction(()=>{this.store.put('capabilityArchivedPackages',{...record,archivedAt:now()});this.store.delete('capabilityPackages',packageId);});return {ok:true,recoverable:true};
  }
  restore(packageId){const record=this.store.require('capabilityArchivedPackages',packageId);if(this.records().some(item=>item.id===packageId))throw new HttpError(409,'同名能力包已存在。','capability_duplicate');this.files(record);const {archivedAt,...restored}=record;this.store.transaction(()=>{this.store.put('capabilityPackages',restored);this.store.delete('capabilityArchivedPackages',packageId);});return this.present(restored);}
  export(packageId){return encodeArchive(this.files(this.record(packageId)));}
  exportDefinition(input){return exportDefinition(this,this.store,input);}
  expertDraft(packageId,{definitionId,locale='zh',name,capabilities,skillMappings={}}={}){
    const pack=this.present(this.record(packageId));
    if(!pack.enabled)throw new HttpError(409,'请先启用此专家包。','capability_disabled');
    const expert=(pack.experts??[]).find(item=>item.id===definitionId);
    if(!expert)throw new HttpError(404,'包内专家不存在。','capability_expert_missing');
    this.files(pack);
    if(!plain(skillMappings))invalid('技能映射无效。');
    const available=this.snapshot().skills;
    const mapped=expert.unresolvedSkills.map(name=>{if(available.some(skill=>skill.id===name))return name;if(typeof skillMappings[name]!=='string')throw new HttpError(409,`需要先为专家配置技能 ${name}。`,'capability_skill_mapping');return skillMappings[name];});
    const binding=this.normalizeBinding({...capabilities,skillIds:capabilities?.skillIds??[...expert.skillIds,...mapped],connectorIds:capabilities?.connectorIds??[],sourceIds:capabilities?.sourceIds??[],packageId:pack.id,definitionId:expert.id,definitionDigest:pack.digest,templateId:expert.id,templateVersion:pack.version,requiredConnectors:expert.connectorNames,outputContract:capabilities?.outputContract??expert.outputContract});
    const language=locale==='en'?'en':'zh';
    return {name:typeof name==='string'&&name.trim()?name.trim():expert.title[language],role:expert.role[language],instructions:expert.instructions,capabilities:binding};
  }
  teamDraft(packageId,{teamId,locale='zh',name,bindings={}}={}){
    const pack=this.present(this.record(packageId)),team=(pack.teams??[]).find(item=>item.id===teamId);
    if(!team)throw new HttpError(404,'包内专家团不存在。','capability_team_missing');
    if(!plain(bindings))invalid('成员配置无效。');
    return {name:typeof name==='string'&&name.trim()?name.trim():team.title[locale==='en'?'en':'zh'],definition:team,members:[team.leadExpertId,...team.memberExpertIds].map(definitionId=>({definitionId,draft:this.expertDraft(packageId,{definitionId,locale,...bindings[definitionId]})}))};
  }
  normalizeBinding(value,previous){
    if(value===undefined)return previous;if(value===null)return undefined;if(!plain(value))invalid('专家能力配置无效。');
    // Existing settings surfaces edit their own section without replacing others.
    value={...previous,...value};
    const skillIds=list(value.skillIds??[],'技能列表',12),connectorIds=list(value.connectorIds??[],'连接器列表',8),sourceIds=list(value.sourceIds??[],'资料列表',100);
    const skills=this.snapshot().skills;for(const key of skillIds)if(!skills.some(skill=>skill.id===key))throw new HttpError(409,'所选技能尚未安装，请先添加对应能力包。','capability_not_installed');
    for(const key of connectorIds)this.store.require('connectors',key);for(const key of sourceIds)this.store.require('sources',key);
    const result={skillIds,connectorIds,sourceIds};
    if(value.requiredConnectors)result.requiredConnectors=strings(value.requiredConnectors,'所需连接器',30);
    for(const key of ['templateId','templateVersion','packageId','definitionId','definitionDigest'])if(value[key]!==undefined){if(typeof value[key]!=='string'||value[key].length>200)invalid('专家模板标识无效。');result[key]=value[key];}
    if(value.outputContract){if(!plain(value.outputContract))invalid('交付要求无效。');result.outputContract={deliverables:strings(value.outputContract.deliverables??[],'交付要求'),checks:strings(value.outputContract.checks??[],'复核要求')};}
    return result;
  }
}
