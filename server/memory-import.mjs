import {createHash} from 'node:crypto';
import {HttpError,id,now} from './store.mjs';
import {createEntity,text} from './domain.mjs';
import {personalContextFor,normalizeContextRequest} from './personal-context.mjs';

export const MEMORY_LIMIT=256*1024;
const MAX_ENTRIES=200,MAX_STATEMENT=2000;
const MAX_EXCERPT=4000;
const layers={facts:'identity',preferences:'preference',goals:'decision',constraints:'constraint',values:'value',capabilities:'capability',decisions:'decision',notes:'decision'};
const aliases={identity:'facts',background:'facts',fact:'facts',preference:'preferences',goal:'goals',constraint:'constraints',value:'values',capability:'capabilities',decision:'decisions',note:'notes'};
const kindLayer={identity:'facts',preference:'preferences',constraint:'constraints',value:'values',capability:'capabilities',decision:'decisions'};
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,code='memory_import_invalid')=>{throw new HttpError(400,message,code);};
const boundedEvidence=value=>({...value,...(typeof value.excerpt==='string'&&value.excerpt.length>MAX_EXCERPT?{excerpt:value.excerpt.trim().slice(0,MAX_EXCERPT),truncated:true}:{})});
function layerOf(value){const layer=aliases[value]??value;return Object.hasOwn(layers,layer)?layer:undefined;}
function headingLayer(value){
  if(/约束|边界|限制|禁忌|boundar|constraint|limit|avoid/i.test(value))return 'constraints';
  if(/偏好|习惯|风格|preference|habit|style/i.test(value))return 'preferences';
  if(/目标|计划|愿望|goal|plan|aspiration/i.test(value))return 'goals';
  if(/价值|原则|value|principle/i.test(value))return 'values';
  if(/能力|技能|擅长|经验|capabilit|skill|expertise/i.test(value))return 'capabilities';
  if(/决定|决策|decision/i.test(value))return 'decisions';
  if(/身份|背景|经历|事实|简介|关于我|identity|background|experience|fact|about me|profile/i.test(value))return 'facts';
  return 'notes';
}
function assertNoCredentials(content){
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{24,}|gh[pousr]_[a-zA-Z0-9]{24,})\b/.test(content))fail('内容含有疑似密钥。请移除凭据后再导入。','memory_contains_credentials');
}
function normalize(body){
  const filename=text(body.filename??'memory.md','filename',180);
  if(/[\\/\x00-\x1f]/.test(filename))fail('请使用文件名，不要提供本机路径。');
  if(!/\.(?:md|markdown|txt|json)$/i.test(filename))fail('请选择 Markdown、文本或 JSON 文件。');
  if(typeof body.content!=='string'||!body.content.trim())fail('请先选择记忆文件或粘贴摘要。');
  if(Buffer.byteLength(body.content)>MEMORY_LIMIT)throw new HttpError(413,'记忆文件最多 256 KiB，请先整理为简短摘要。','memory_import_too_large');
  const content=body.content.replace(/^\uFEFF/,'');
  if(content.includes('\0'))fail('文件不是可读取的 UTF-8 文本。');
  assertNoCredentials(content);
  const sha256=digest(body.content),candidates=[],warnings=[];
  function add(layer,statement,evidence){
    if(typeof statement!=='string'||!statement.trim())fail('每条记忆需要非空 statement。');
    if(statement.trim().length>MAX_STATEMENT)fail('单条记忆最多 2000 字符，请拆分长段落。');
    if(candidates.length>=MAX_ENTRIES)fail('每次最多导入 200 条记忆，请拆分文件。');
    const clean=statement.trim();
    const key=digest(JSON.stringify([sha256,layer,clean,evidence.pointer??evidence.lineStart])).slice(0,32);
    candidates.push({id:`memory-fact-${key}`,layer,kind:layers[layer],statement:clean,evidence:boundedEvidence(evidence)});
  }
  const fencedJson=content.trim().match(/^```(?:json)?\s*\n(\s*\{[\s\S]*\})\s*\n```$/i)?.[1];
  const json=!!fencedJson||filename.toLowerCase().endsWith('.json')||content.trimStart().startsWith('{');
  if(json){
    let value;try{value=JSON.parse(fencedJson??content);}catch{fail('JSON 格式无效。可使用结构化摘要示例，或粘贴 Markdown。');}
    if(!value||typeof value!=='object'||Array.isArray(value))fail('结构化摘要需要 JSON 对象。');
    if(value.schema!==undefined&&value.schema!=='secondu.digital-twin'&&value.schema!=='secondu.memory')fail('不支持此记忆 schema；请使用通用摘要格式。');
    if(value.schemaVersion!==undefined&&value.schemaVersion!==1)fail('不支持此记忆 schemaVersion。');
    if(value.entries!==undefined){
      if(!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES)fail('entries 必须为最多 200 项的数组。');
      value.entries.forEach((entry,index)=>{
        if(!entry||typeof entry!=='object'||Array.isArray(entry))fail('每条 entries 记录须为对象。');
        const layer=layerOf(entry.layer);if(!layer)fail('记忆 layer 无效。');
        add(layer,entry.statement,{excerpt:typeof entry.statement==='string'?entry.statement:'',pointer:`/entries/${index}/statement`});
      });
    }else{
      for(const [key,items] of Object.entries(value)){
        const layer=layerOf(key);if(!layer)continue;
        if(!Array.isArray(items))fail(`${key} 必须为数组。`);
        for(const [index,item] of items.entries())add(layer,typeof item==='string'?item:item?.statement,{excerpt:typeof item==='string'?item:item?.statement??'',pointer:`/${key}/${index}`});
      }
    }
    if(value.evidence)warnings.push('external_evidence_unverified');
  }else{
    const lines=content.split(/\r?\n/);let layer='notes',fence,frontMatter=false,paragraph=[];
    const flush=()=>{if(!paragraph.length)return;add(layer,paragraph.map(item=>item.text).join('\n'),{excerpt:paragraph.map(item=>item.raw).join('\n'),lineStart:paragraph[0].line,lineEnd:paragraph.at(-1).line});paragraph=[];};
    for(let index=0;index<lines.length;index++){
      const raw=lines[index],line=raw.trim();
      if(index===0&&line==='---'){frontMatter=true;continue;}
      if(frontMatter){if(line==='---'||line==='...')frontMatter=false;continue;}
      const marker=line.match(/^(`{3,}|~{3,})/);
      if(marker){flush();if(!fence){fence=marker[1][0];if(!warnings.includes('code_blocks_skipped'))warnings.push('code_blocks_skipped');}else if(marker[1][0]===fence)fence=undefined;continue;}
      if(fence)continue;
      if(!line||/^[-*_]{3,}$/.test(line)){flush();continue;}
      const heading=line.match(/^#{1,6}\s+(.+)$/);if(heading){flush();layer=headingLayer(heading[1]);continue;}
      const bullet=line.match(/^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)(.+)$/);
      if(bullet){flush();add(layer,bullet[1],{excerpt:raw,lineStart:index+1,lineEnd:index+1});}
      else paragraph.push({text:line,raw,line:index+1});
    }
    flush();
    if(frontMatter)fail('YAML 文件头未闭合，请检查 Markdown。');
    warnings.push('heading_based_extraction');
  }
  if(!candidates.length)fail('没有找到可导入条目。请添加个人背景、偏好、目标或约束。');
  if(/^(?:AGENTS|CLAUDE)\.md$/i.test(filename))warnings.push('project_instructions_are_candidates');
  return {filename,content:body.content,sha256,format:json?'json':'markdown',candidates,warnings};
}

export function previewMemoryImport(store,body){
  const data=normalize(body),stamp=now();
  for(const preview of store.list('memoryImportPreviews'))if(preview.expiresAt<stamp)store.delete('memoryImportPreviews',preview.id);
  const previous=store.list('memoryImportPreviews');while(previous.length>=20)store.delete('memoryImportPreviews',previous.shift().id);
  const previewId=id('memory-preview'),expiresAt=new Date(Date.now()+30*60*1000).toISOString();
  store.put('memoryImportPreviews',{id:previewId,data,expiresAt});
  return {previewId,filename:data.filename,sha256:data.sha256,format:data.format,candidates:data.candidates.map(candidate=>({...candidate,alreadyImported:!!store.get('facts',candidate.id)})),warnings:data.warnings,expiresAt};
}
export function commitMemoryImport(store,body){
  const preview=store.require('memoryImportPreviews',text(body.previewId,'previewId',150));
  if(preview.expiresAt<now())throw new HttpError(409,'预览已过期，请重新读取文件。','preview_expired');
  if(!Array.isArray(body.candidateIds)||!body.candidateIds.length||body.candidateIds.length>MAX_ENTRIES||body.candidateIds.some(key=>typeof key!=='string'))fail('请选择至少一条待导入记忆。');
  const selected=[...new Set(body.candidateIds)].sort(),selectionHash=digest(JSON.stringify(selected));
  const previous=store.get('memoryImportCommits',preview.id);
  if(previous){if(previous.selectionHash!==selectionHash)throw new HttpError(409,'本次预览已经保存了另一组条目，请重新预览。','memory_selection_conflict');return {...previous.result,added:0,duplicates:previous.result.factIds.length,alreadyImported:true};}
  const candidates=selected.map(key=>preview.data.candidates.find(item=>item.id===key));
  if(candidates.some(item=>!item))fail('所选条目不属于当前预览。');
  const sourceId=`source-memory-${preview.data.sha256.slice(0,32)}`,stamp=now();
  const result={sourceId,factIds:selected,added:0,duplicates:0,alreadyImported:false};
  store.transaction(()=>{
    if(!store.get('sources',sourceId))store.put('sources',{id:sourceId,title:preview.data.filename,kind:'document',text:preview.data.content,createdAt:stamp,demo:store.meta('profile').demo===true,memoryImport:{schemaVersion:1,filename:preview.data.filename,sha256:preview.data.sha256,importedAt:stamp}});
    for(const candidate of candidates){
      // IDs bind to the original source and position. Reimport never overwrites
      // a later user confirmation, correction, or supersession.
      if(store.get('facts',candidate.id)){result.duplicates++;continue;}
      const fact=createEntity(store,'facts',{kind:candidate.kind,statement:candidate.statement,status:'candidate',sourceIds:[sourceId],reason:'用户选择导入；尚未确认为个人事实'});
      fact.id=candidate.id;store.put('facts',fact);
      store.put('memoryImportItems',{id:fact.id,sourceId,layer:candidate.layer,kind:candidate.kind,evidence:candidate.evidence});result.added++;
    }
    store.put('memoryImportCommits',{id:preview.id,selectionHash,result,createdAt:stamp});
  });
  return result;
}

/** One explicit review is atomic: original candidate and confirmed correction
 * remain separate revisions. No task, model call or external grant is created.
 */
export function reviewMemoryImport(store,body){
  const previewId=text(body.previewId,'previewId',150);
  if(body.confirmed!==true)fail('请明确确认已逐条核对所选内容。','memory_confirmation_required');
  if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>MAX_ENTRIES)fail('请选择至少一条要核对的记忆。');
  const entries=body.entries.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['id','statement','layer'].includes(key)))fail('核对条目格式无效。');
    const key=text(entry.id,'id',150),statement=text(entry.statement,'statement',MAX_STATEMENT),layer=layerOf(entry.layer);
    if(!layer||statement.includes('\0'))fail('核对条目的分类或内容无效。');
    assertNoCredentials(statement);return {id:key,statement,layer};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(entries.map(entry=>entry.id)).size!==entries.length)fail('同一条记忆只能核对一次。');
  const requestHash=digest(JSON.stringify(entries)),previous=store.get('memoryImportReviews',previewId);
  if(previous){
    if(previous.requestHash!==requestHash)throw new HttpError(409,'这次预览已保存另一份核对结果，请重新预览。','memory_review_conflict');
    const facts=previous.result.factIds.map(key=>store.get('facts',key));
    if(facts.some(fact=>!fact))throw new HttpError(409,'已核对条目后来被移除，请重新预览。','memory_review_changed');
    return {...previous.result,added:0,duplicates:facts.length,alreadyImported:true,facts};
  }
  const preview=store.require('memoryImportPreviews',previewId);
  if(preview.expiresAt<now())throw new HttpError(409,'预览已过期，请重新读取文件。','preview_expired');
  const candidates=entries.map(entry=>preview.data.candidates.find(candidate=>candidate.id===entry.id));
  if(candidates.some(candidate=>!candidate))fail('所选条目不属于当前预览。');
  if(entries.some(entry=>store.get('facts',entry.id)))throw new HttpError(409,'部分条目已导入，请刷新预览并保留已有修订。','memory_already_imported');
  const sourceId=`source-memory-${preview.data.sha256.slice(0,32)}`,stamp=now();
  const result={sourceId,factIds:entries.map(entry=>entry.id),added:entries.length,duplicates:0,alreadyImported:false};
  const facts=store.transaction(()=>{
    if(!store.get('sources',sourceId))store.put('sources',{id:sourceId,title:preview.data.filename,kind:'document',text:preview.data.content,createdAt:stamp,demo:store.meta('profile').demo===true,memoryImport:{schemaVersion:1,filename:preview.data.filename,sha256:preview.data.sha256,importedAt:stamp}});
    const saved=entries.map((entry,index)=>{
      const candidate=candidates[index],original=createEntity(store,'facts',{kind:candidate.kind,statement:candidate.statement,status:'candidate',sourceIds:[sourceId],reason:'从用户选择的原文提取；等待本人核对'});
      original.id=candidate.id;
      const fact=createEntity(store,'facts',{baseVersion:original.version,kind:layers[entry.layer],statement:entry.statement,status:'confirmed',reason:'用户在导入预览中逐条核对、修订并明确确认'},original);
      store.put('facts',fact);store.put('memoryImportItems',{id:fact.id,sourceId,layer:entry.layer,kind:fact.kind,originalLayer:candidate.layer,evidence:candidate.evidence});return fact;
    });
    store.put('memoryImportReviews',{id:previewId,requestHash,result,createdAt:stamp});return saved;
  });
  return {...result,facts};
}

export function digitalTwinPackage(store,{at=now()}={}){
  const sources=new Map(store.list('sources').map(source=>[source.id,source])),used=new Set();
  const entries=store.list('facts').map(fact=>{
    const imported=store.get('memoryImportItems',fact.id);
    const evidence=fact.sourceIds.filter(key=>sources.has(key)).map(sourceId=>{
      used.add(sourceId);return {sourceId,...(imported?.sourceId===sourceId?boundedEvidence(imported.evidence):{})};
    });
    return {id:fact.id,layer:imported?.kind===fact.kind?imported.layer:kindLayer[fact.kind]??'notes',kind:fact.kind,...(fact.preferenceDomain?{preferenceDomain:fact.preferenceDomain}:{}),statement:fact.statement,status:fact.status,revision:fact.version,updatedAt:fact.updatedAt,evidence};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const evidence=[...used].sort().map(key=>{const source=sources.get(key);return {id:key,title:source.title,kind:source.kind,sha256:digest(source.text??''),...(source.createdAt?{recordedAt:source.createdAt}:{})};});
  const data={schema:'secondu.digital-twin',schemaVersion:1,subject:{name:store.meta('profile').name},entries,evidence};
  return {...data,revision:digest(JSON.stringify(data)),exportedAt:at};
}
export function digitalTwinMarkdown(data){
  const line=value=>String(value).replace(/[\r\n]+/g,' ');
  const lines=['# Digital twin context','',`Schema: ${data.schema} v${data.schemaVersion}`,`Revision: ${data.revision}`,`Exported: ${data.exportedAt}`,'',`Name: ${line(data.subject.name)}`,'','Entries preserve their review status. Candidate and inferred records are not confirmed facts.',''];
  for(const layer of Object.keys(layers)){
    const entries=data.entries.filter(entry=>entry.layer===layer);if(!entries.length)continue;
    lines.push(`## ${layer}`,'');
    for(const entry of entries){lines.push(`- **[${entry.status}; revision ${entry.revision}]** ${line(entry.statement)}`);for(const ref of entry.evidence)lines.push(`  - Evidence: ${ref.sourceId}${ref.lineStart?`, lines ${ref.lineStart}–${ref.lineEnd}`:ref.pointer?`, ${ref.pointer}`:''}`);}
    lines.push('');
  }
  lines.push('## Evidence index','');
  for(const source of data.evidence)lines.push(`- ${source.id}: ${line(source.title)} (SHA-256 ${source.sha256})`);
  lines.push('','Raw source files, credentials, account connections and executable instructions are not included.','');
  return lines.join('\n');
}
export function digitalTwinContext(store,body){
  const prompt=text(body.prompt,'prompt',10000),request=normalizeContextRequest(body.contextRequest);
  const bundle=personalContextFor(store,{prompt,digitalTwinEnabled:true,contextRequest:request});
  return {...bundle,packageRevision:digitalTwinPackage(store).revision};
}
