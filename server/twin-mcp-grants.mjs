import {mkdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpError,id,now,atomicWrite} from './store.mjs';
import {digitalTwinPackage} from './memory-import.mjs';
import {TWIN_DOMAINS,packageHash} from './twin-mcp-data.mjs';

/** UI-managed reviewed snapshots; no external process starts from this service. */
export class TwinMcpGrants {
  constructor(store,{nodeCommand=process.execPath,entrypoint=fileURLToPath(new URL('./twin-mcp-cli.mjs',import.meta.url))}={}){this.store=store;this.nodeCommand=nodeCommand;this.entrypoint=entrypoint;}
  public(record){
    const {packageFile,packageSha256,configFile,...value}=record;
    return {...value,configuration:{mcpServers:{secondu:{command:this.nodeCommand,args:[this.entrypoint,'--config',configFile],...(process.versions.electron?{env:{ELECTRON_RUN_AS_NODE:'1'}}:{})}}}};
  }
  list(){return this.store.list('twinMcpGrants').map(record=>this.public(record));}
  create(body){
    if(!Array.isArray(body.scopes))throw new HttpError(400,'请选择有效的个人上下文范围。','mcp_scope_invalid');
    const scopes=[...new Set(body.scopes)];
    if(typeof body.clientName!=='string'||!body.clientName.trim()||body.clientName.length>100||/[\x00-\x1f]/.test(body.clientName))throw new HttpError(400,'请填写要授权的 AI 客户端名称。','mcp_client_invalid');
    if(!scopes.length||scopes.some(scope=>!TWIN_DOMAINS.includes(scope)))throw new HttpError(400,'请选择有效的个人上下文范围。','mcp_scope_invalid');
    for(const key of ['includeName','includeEvidence','enabled'])if(body[key]!==undefined&&typeof body[key]!=='boolean')throw new HttpError(400,'授权选项无效。','mcp_grant_invalid');
    if(body.enabled===true&&body.acknowledgeExternal!==true)throw new HttpError(400,'启用前请确认该客户端及其模型可以读取所选资料。','mcp_external_ack_required');
    if(body.includeName&&!scopes.includes('facts'))throw new HttpError(400,'导出称呼需要选择背景与事实范围。','mcp_name_scope');
    const source=digitalTwinPackage(this.store);if(body.baseRevision!==source.revision)throw new HttpError(409,'个人上下文已更新，请重新核对后创建授权包。','mcp_package_revision_conflict');
    if(body.entryIds!==undefined&&(!Array.isArray(body.entryIds)||!body.entryIds.length||body.entryIds.length>2000||body.entryIds.some(key=>typeof key!=='string'||!source.entries.some(entry=>entry.id===key&&entry.status==='confirmed'&&scopes.includes(entry.layer)))))throw new HttpError(400,'所选条目须属于已确认的授权范围。','mcp_entry_invalid');
    const selected=new Set(body.entryIds),entries=source.entries.filter(entry=>entry.status==='confirmed'&&scopes.includes(entry.layer)&&(!body.entryIds||selected.has(entry.id))).map(entry=>({...entry,evidence:body.includeEvidence?entry.evidence:[]}));
    if(!entries.length)throw new HttpError(400,'所选范围还没有已确认条目。请先在个人画像中核对。','mcp_scope_empty');
    if(entries.length>2000)throw new HttpError(400,'每份授权包最多 2000 条，请缩小范围。','mcp_scope_too_large');
    const evidenceIds=new Set(entries.flatMap(entry=>entry.evidence.map(ref=>ref.sourceId)));
    const snapshot={schema:source.schema,schemaVersion:1,subject:{name:body.includeName?source.subject.name:''},entries,evidence:source.evidence.filter(ref=>evidenceIds.has(ref.id))};
    const exported={...snapshot,revision:packageHash(JSON.stringify(snapshot)),exportedAt:now()},bytes=JSON.stringify(exported,null,2)+'\n';
    if(Buffer.byteLength(bytes)>4*1024*1024)throw new HttpError(400,'授权包过大，请缩小范围。','mcp_scope_too_large');
    const grantId=id('twin-grant'),root=path.join(this.store.directory,'mcp-grants');mkdirSync(root,{recursive:true,mode:0o700});if(realpathSync(root)!==root)throw new HttpError(409,'授权目录不可用。','mcp_directory_invalid');
    const directory=path.join(root,grantId);mkdirSync(directory,{mode:0o700});
    const packageFile=path.join(directory,'reviewed-package.json'),configFile=path.join(directory,'client-grant.json');
    const record={id:grantId,revision:1,clientName:body.clientName.trim(),enabled:body.enabled===true,scopes,entryIds:entries.map(entry=>entry.id),includeName:body.includeName===true,includeEvidence:body.includeEvidence===true,maxChars:8000,packageFile,packageSha256:packageHash(bytes),packageRevision:exported.revision,sourceRevision:source.revision,configFile,createdAt:now(),updatedAt:now()};
    atomicWrite(packageFile,bytes);this.writeConfig(record);
    try{this.store.put('twinMcpGrants',record);}catch(error){this.writeConfig({...record,enabled:false});throw error;}
    return this.public(record);
  }
  writeConfig(record){const {enabled,clientName,packageFile,packageSha256,scopes,entryIds,includeName,includeEvidence,maxChars}=record;atomicWrite(record.configFile,JSON.stringify({schemaVersion:1,enabled,clientName,packageFile,packageSha256,scopes,entryIds,includeName,includeEvidence,maxChars},null,2)+'\n');}
  setEnabled(key,body){
    const old=this.store.require('twinMcpGrants',key);if(body.revision!==old.revision)throw new HttpError(409,'授权已更新，请刷新后重试。','mcp_grant_revision_conflict');
    if(typeof body.enabled!=='boolean'||body.enabled&&body.acknowledgeExternal!==true)throw new HttpError(400,'启用前请确认该客户端及其模型可以读取所选资料。','mcp_external_ack_required');
    const record={...old,enabled:body.enabled,revision:old.revision+1,updatedAt:now()};this.writeConfig(record);
    try{this.store.put('twinMcpGrants',record);}catch(error){this.writeConfig(old);throw error;}
    return this.public(record);
  }
}
