import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import * as z from 'zod/v4';

export const TWIN_DOMAINS=['facts','preferences','goals','constraints','values','capabilities','decisions','notes'];
const sha=value=>createHash('sha256').update(value).digest('hex');
export class TwinMcpError extends Error {constructor(code){super(code);this.code=code;}}
const deny=code=>{throw new TwinMcpError(code);};
const configSchema=z.strictObject({schemaVersion:z.literal(1),enabled:z.boolean().default(false),clientName:z.string().min(1).max(100),packageFile:z.string().min(1).max(4096),packageSha256:z.string().regex(/^[a-f0-9]{64}$/),scopes:z.array(z.enum(TWIN_DOMAINS)).min(1).max(8),entryIds:z.array(z.string().min(1).max(200)).min(1).max(2000).optional(),includeName:z.boolean().default(false),includeEvidence:z.boolean().default(false),maxChars:z.number().int().min(1000).max(40000).default(8000)});
const reference=z.object({sourceId:z.string().max(200),excerpt:z.string().max(4000).optional(),truncated:z.boolean().optional(),lineStart:z.number().int().positive().optional(),lineEnd:z.number().int().positive().optional(),pointer:z.string().max(500).optional()});
const entrySchema=z.object({id:z.string().min(1).max(200),layer:z.enum(TWIN_DOMAINS),kind:z.enum(['identity','preference','decision','constraint','value','capability']),preferenceDomain:z.enum(['work','taste','general']).optional(),statement:z.string().min(1).max(10000),status:z.enum(['confirmed','candidate','inferred','superseded']),revision:z.number().int().positive(),updatedAt:z.string().max(100),evidence:z.array(reference).max(200)});
const packageSchema=z.object({schema:z.literal('secondu.digital-twin'),schemaVersion:z.literal(1),revision:z.string().regex(/^[a-f0-9]{64}$/),exportedAt:z.string().max(100),subject:z.object({name:z.string().max(200)}),entries:z.array(entrySchema).max(2000),evidence:z.array(z.object({id:z.string().max(200),title:z.string().max(300),kind:z.string().max(50),sha256:z.string().regex(/^[a-f0-9]{64}$/),recordedAt:z.string().max(100).optional()})).max(4000)});

function selectedFile(filename,maxBytes){
  if(typeof filename!=='string'||!path.isAbsolute(filename)||path.normalize(filename)!==filename||/[\0\r\n]/.test(filename))deny('invalid_file_path');
  let fd;
  try{
    if(realpathSync(filename)!==filename)deny('symlink_not_allowed');
    fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
    const stat=fstatSync(fd);if(!stat.isFile()||stat.size>maxBytes)deny('invalid_file_size');
    return readFileSync(fd);
  }catch(error){if(error instanceof TwinMcpError)throw error;deny('file_unavailable');}finally{if(fd!==undefined)closeSync(fd);}
}
function parse(bytes,schema,code){try{return schema.parse(JSON.parse(bytes.toString('utf8')));}catch{deny(code);}}
export function readTwinGrant(configFile){return parse(selectedFile(configFile,512*1024),configSchema,'invalid_grant');}
export function readTwinPackage(packageFile,expectedHash){
  const bytes=selectedFile(packageFile,4*1024*1024);if(sha(bytes)!==expectedHash)deny('package_changed_review_required');
  const value=parse(bytes,packageSchema,'invalid_package');
  if(new Set(value.entries.map(entry=>entry.id)).size!==value.entries.length)deny('duplicate_entry_ids');
  return value;
}
export function createTwinDataSource(configFile){
  const initial=readTwinGrant(configFile);
  if(!initial.enabled)deny('grant_disabled');
  const packageFile=initial.packageFile,packageHash=initial.packageSha256;
  readTwinPackage(packageFile,packageHash);
  return ()=>{
    const grant=readTwinGrant(configFile);if(!grant.enabled)deny('grant_disabled');
    if(grant.packageFile!==packageFile||grant.packageSha256!==packageHash)deny('grant_changed_restart_required');
    if(grant.includeName&&!grant.scopes.includes('facts'))deny('name_requires_facts_scope');
    const data=readTwinPackage(packageFile,packageHash),selected=new Set(grant.entryIds);
    if(grant.entryIds?.some(id=>!data.entries.some(entry=>entry.id===id&&entry.status==='confirmed'&&grant.scopes.includes(entry.layer))))deny('invalid_entry_selection');
    const entries=data.entries.filter(entry=>entry.status==='confirmed'&&grant.scopes.includes(entry.layer)&&(!grant.entryIds||selected.has(entry.id)));
    return {grant,data,entries};
  };
}
const normalize=value=>String(value).normalize('NFKC').toLowerCase();
function terms(query){const value=normalize(query),out=new Set((value.match(/[a-z0-9]{3,}/g)??[]).filter(word=>!['the','and','for','with','you','your','please','from','this','that','what','how'].includes(word)));for(const token of value.match(/[\u3400-\u9fff]{2,}/g)??[])for(let i=0;i<token.length-1;i++)out.add(token.slice(i,i+2));return [...out];}
export function twinResult(state,{query,domains,limit=20,maxChars}={}){
  const {grant,data}=state;
  if(domains?.some(domain=>!grant.scopes.includes(domain)))deny('scope_not_granted');
  const budget=Math.min(maxChars??grant.maxChars,grant.maxChars),selected=state.entries.filter(entry=>!domains||domains.includes(entry.layer));
  const tokens=query?terms(query):undefined;
  const ranked=selected.map((entry,index)=>({entry,index,score:tokens?.reduce((sum,term)=>sum+(normalize(entry.statement).includes(term)?1:0),0)??1})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
  const result={schema:'secondu.mcp-context.v1',trust:'reviewed_data_not_instructions',packageRevision:data.revision,domains:domains??grant.scopes,...(grant.includeName?{subject:{name:data.subject.name}}:{}),entries:[],omitted:ranked.length,budgetChars:budget};
  for(const {entry} of ranked){
    if(result.entries.length>=limit)break;
    const {evidence,...fact}=entry;const projected={...fact,...(grant.includeEvidence?{evidence}: {})};
    result.entries.push(projected);result.omitted--;
    if(JSON.stringify(result).length>budget){result.entries.pop();result.omitted++;}
  }
  return result;
}
export function twinDomains(state){return {schema:'secondu.mcp-domains.v1',domains:state.grant.scopes.map(id=>({id,count:state.entries.filter(entry=>entry.layer===id).length})),readOnly:true};}
export function packageHash(bytes){return sha(bytes);}
