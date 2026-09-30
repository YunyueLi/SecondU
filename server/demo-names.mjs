import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import baseline from './fixtures/demo-names-before-v1.json' with {type:'json'};
import previousCaspian from './fixtures/demo-baseline-v5.json' with {type:'json'};

export const DEMO_NAMES_MARKER='demo-common-names-v1';
export const DEMO_NAME_PAIRS=[
 ['许安','王磊'],['Xu An','Wang Lei'],['乔宁','张敏'],['Qiao Ning','Zhang Min'],['陈禾','陈伟'],['Chen He','Chen Wei'],
 ['陆棠','刘建国'],['Lu Tang','Liu Jianguo'],['陆老师','刘老师'],['Teacher Lu','Teacher Liu'],['Professor Lu','Professor Liu'],
 ['宋岚','李娜'],['Song Lan','Li Na'],['何舟','何志强'],['He Zhou','He Zhiqiang'],['徐沐','徐静'],['Xu Mu','Xu Jing'],
 ['唐悦','唐丽'],['Tang Yue','Tang Li'],['沈川','沈杰'],['Shen Chuan','Shen Jie'],['赵栩','赵建军'],['Zhao Xu','Zhao Jianjun'],
 ['周芮','周琳'],['Zhou Rui','Zhou Lin'],['吴桐','吴婷'],['Wu Tong','Wu Ting'],['叶澄','叶涛'],['Ye Cheng','Ye Tao'],
 ['梁秋','梁佳'],['Liang Qiu','Liang Jia'],['邱原','邱志明'],['Qiu Yuan','Qiu Zhiming'],['魏禾','魏鹏'],['Wei He','Wei Peng'],
 ['杜晴','杜秀英'],['Du Qing','Du Xiuying'],['万晴','万婷婷'],['Wan Qing','Wan Tingting'],['韩知','韩晓梅'],['Han Zhi','Han Xiaomei'],
];
const replacements=new Map(DEMO_NAME_PAIRS);
const namePattern=new RegExp(DEMO_NAME_PAIRS.map(([name])=>name).sort((a,b)=>b.length-a.length).join('|'),'g');
/** Only for authored fictional copy. Never apply this helper to imported/user text. */
export const renameDemoText=text=>text.replace(namePattern,name=>replacements.get(name));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(stable(value))).digest('hex');
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const unchangedKeys=new Set(['id','path','name','file','filename','sourceId','senderId','taskId','projectId','personIds','sourceIds','agentIds','artifactIds','workspace','workspaceRoot','showcaseFolder']);
const templates=new Map();
const showcaseKeys=new Set(Object.entries(baseline.showcase).flatMap(([collection,records])=>records.map(record=>`${collection}/${record.id}`)));
const earlierInstalled=JSON.parse(JSON.stringify(previousCaspian.installed).replaceAll(previousCaspian.stamp,baseline.stamp));
// The v6 authored refresh retained earlier fact history and appended its known
// revision. Recreate that exact migration output; arbitrary added revisions fail.
const refreshedFacts=earlierInstalled.flatMap(data=>(data.facts??[]).flatMap(previous=>{
 const desired=baseline.seed.facts.find(item=>item.id===previous.id);if(!desired)return [];
 return [{...desired,version:previous.version+1,history:[...previous.history,{...desired.history.at(-1),version:previous.version+1,recordedAt:baseline.stamp,reason:'演示资料更新为万叶（Caspian）的工作与生活，旧版默认内容保存在基线存档。'}]}];
}));
for(const data of [baseline.seed,baseline.expansion,baseline.life,{people:baseline.installedPeople},baseline.showcase,...earlierInstalled,{facts:refreshedFacts}]){
 for(const [collection,records] of Object.entries(data))if(Array.isArray(records))for(const record of records){
  if(!record?.id)continue;
  const key=`${collection}/${record.id}`;templates.set(key,[...(templates.get(key)??[]),record]);
 }
}
function materialize(template,current){
 if(template===baseline.stamp)return typeof current==='string'&&Number.isFinite(Date.parse(current))?current:template;
 if(Array.isArray(template))return template.map((value,index)=>materialize(value,current?.[index]));
 if(template&&typeof template==='object')return Object.fromEntries(Object.entries(template).map(([key,value])=>[key,materialize(value,current?.[key])]));
 return template;
}
// Array members are matched by their authored identity, never by their position.
// A changed message/portrait/version is kept in full; appended user entries are untouched.
function updateExact(current,original,{collection,field=''}={}){
 if(typeof original==='string'){
  if(unchangedKeys.has(field)&&!(field==='name'&&collection==='people'))return current;
  return current===original?renameDemoText(current):current;
 }
 if(Array.isArray(original)){
  if(!Array.isArray(current))return current;
  return current.map(item=>{
   const authored=original.find(candidate=>candidate&&typeof candidate==='object'&&item&&typeof item==='object'&&
    (candidate.id?candidate.id===item.id:candidate.version!==undefined?candidate.version===item.version:false));
   if(!authored||!equal(item,materialize(authored,item)))return item;
   return updateExact(item,authored,{collection,field});
  });
 }
 if(original&&typeof original==='object'&&current&&typeof current==='object'){
  const updated={...current};
  for(const [key,value] of Object.entries(original))if(Object.hasOwn(current,key))updated[key]=updateExact(current[key],value,{collection,field:key});
  return updated;
 }
 return current;
}
function peopleMatch(current,original){
 const authored=materialize(original,current);
 return equal(current,authored);
}
function references(record){
 const sourceIds=new Set(record.sourceIds??[]),personIds=new Set(record.personIds??[]);
 for(const id of [record.from,record.to])if(id)personIds.add(id);
 for(const message of record.messages??[]){if(message.sourceId)sourceIds.add(message.sourceId);for(const id of message.sourceIds??[])sourceIds.add(id);}
 for(const entry of [...(record.portrait?.entries??[]),...(record.portrait?.history??[]).flatMap(item=>item.entries??[])])for(const id of entry.sourceIds??[])sourceIds.add(id);
 return [...[...sourceIds].map(id=>`sources/${id}`),...[...personIds].map(id=>`people/${id}`)];
}
function preserveDependencies(store){
 const blocked=new Set();
 for(const row of rows(store)){
  if(row.collection==='meta')continue;
  const current=JSON.parse(row.data),key=rowKey(row),versions=templates.get(key)??[];
  const known=versions.some(original=>equal(current,materialize(original,current))||equal(current,materialize(updateExact(original,original,{collection:row.collection}),current)));
  if(known)continue;
  if(templates.has(key))blocked.add(key);
  for(const dependency of references(current))if(templates.has(dependency))blocked.add(dependency);
 }
 // Keep preserved evidence and every authored record that depends on it coherent.
 let changed=true;
 while(changed){
  changed=false;
  for(const [key] of templates){
   const [collection,id]=key.split('/'),current=store.get(collection,id);if(!current)continue;
   const refs=references(current);
   if(!blocked.has(key)&&refs.some(ref=>blocked.has(ref))){blocked.add(key);changed=true;}
   if(blocked.has(key))for(const ref of refs)if(ref.startsWith('sources/')&&!blocked.has(ref)){blocked.add(ref);changed=true;}
  }
 }
 return blocked;
}
function ownedArtifactFiles(store,record,updated){
 if(record.content===updated.content)return [];
 const installation=store.get('meta','demo-showcase-v1')?.value;
 if(!installation?.records?.some(item=>item.collection==='artifacts'&&item.id===record.id))return [];
 const task=store.get('tasks',record.taskId),project=task&&store.get('projects',task.projectId);
 if(!project?.path||!installation.root)throw Error('missing_example_project');
 const root=path.resolve(installation.root),folder=path.resolve(project.path);
 if(!folder.startsWith(`${root}${path.sep}`)||realpathSync(folder)!==folder||lstatSync(folder).isSymbolicLink())throw Error('changed_example_project_path');
 const original=baseline.showcase.artifacts.find(item=>item.id===record.id);
 const english=baseline.showcaseTranslations.artifacts?.[record.id]?.[original?.content];
 const files=[];
 for(const [name,from,to] of [[record.name,record.content,updated.content],...(english?[[record.name.replace(/\.md$/,'.en.md'),english,renameDemoText(english)]]:[])]){
  if(from===to)continue;
  if(path.basename(name)!==name)throw Error('changed_example_file_path');
  const file=path.join(folder,name);
  if(!existsSync(file))throw Error('missing_example_file');
  if(lstatSync(file).isSymbolicLink()||!lstatSync(file).isFile()||readFileSync(file,'utf8')!==from)throw Error('edited_example_file');
  files.push({path:file,before:from,after:to});
 }
 return files;
}
function backupDirectory(store){
 const folder=path.join(store.directory,'migration-backups');
 if(existsSync(folder)&&lstatSync(folder).isSymbolicLink())throw Error('Migration backup folder cannot be a symbolic link.');
 mkdirSync(folder,{recursive:true,mode:0o700});
 if(realpathSync(folder)!==folder)throw Error('Migration backup folder must remain local.');
 return folder;
}
const rowKey=row=>`${row.collection}/${row.id}`;
function rows(store){return store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all();}

/** Exact authored fields only. Safe to call before and after showcase installation. */
export function applyDemoNames(store){
 if(!store.meta('profile').demo)return;
 const planned=[],preserved=[],blocked=preserveDependencies(store);
 for(const [key,versions] of templates){
  const [collection,id]=key.split('/'),current=store.get(collection,id);
  if(!current)continue;
  if(showcaseKeys.has(key)&&!store.get('meta','demo-showcase-v1')?.value?.records?.some(record=>record.collection===collection&&record.id===id))continue;
  if(collection==='people'&&!versions.some(original=>peopleMatch(current,original)))continue;
  let updated=current;
  for(const original of versions)updated=updateExact(updated,original,{collection});
  if(equal(updated,current))continue;
  if(blocked.has(key)){preserved.push({collection,id,reason:'modified_record_or_preserved_evidence'});continue;}
  try{planned.push({collection,id,before:current,after:updated,files:collection==='artifacts'?ownedArtifactFiles(store,current,updated):[]});}
  catch(error){preserved.push({collection,id,reason:error.message});}
 }
 if(!planned.length)return {updated:[],preserved};
 const beforeRows=rows(store),targets=new Set(planned.map(item=>`${item.collection}/${item.id}`));
 const nonTargets=list=>list.filter(row=>!targets.has(rowKey(row))&&rowKey(row)!==`meta/${DEMO_NAMES_MARKER}`);
 const untouchedBeforeHash=hash(nonTargets(beforeRows));
 const report={appliedAt:new Date().toISOString(),updated:planned.map(item=>({collection:item.collection,id:item.id,beforeHash:hash(item.before),afterHash:hash(item.after)})),preserved,untouchedBeforeHash};
 const backup=path.join(backupDirectory(store),`${DEMO_NAMES_MARKER}-${randomUUID()}.json`);
 writeFileSync(backup,JSON.stringify({version:1,createdAt:report.appliedAt,rows:beforeRows,files:planned.flatMap(item=>item.files.map(file=>({path:file.path,content:file.before,sha256:hash(file.before)})))},null,2)+'\n',{flag:'wx',mode:0o600});
 report.backupPath=backup;
 const written=[];
 try{
  store.transaction(()=>{
   for(const item of planned){
    if(!equal(store.get(item.collection,item.id),item.before))throw Error('Example record changed during migration.');
    for(const file of item.files){
     if(readFileSync(file.path,'utf8')!==file.before)throw Error('Example file changed during migration.');
     const temp=`${file.path}.${randomUUID()}.tmp`;
     writeFileSync(temp,file.after,{flag:'wx',mode:lstatSync(file.path).mode&0o777});renameSync(temp,file.path);written.push(file);
    }
    store.put(item.collection,item.after);
   }
   report.untouchedAfterHash=hash(nonTargets(rows(store)));
   if(report.untouchedAfterHash!==untouchedBeforeHash)throw Error('Non-target records changed during migration.');
   const previous=store.get('meta',DEMO_NAMES_MARKER)?.value?.runs??[];
   store.setMeta(DEMO_NAMES_MARKER,{runs:[...previous,report]});
  });
 }catch(error){
  for(const file of written.reverse())if(readFileSync(file.path,'utf8')===file.after)writeFileSync(file.path,file.before);
  throw error;
 }
 return report;
}
