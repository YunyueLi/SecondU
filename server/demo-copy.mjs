import {createHash,randomUUID} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,realpathSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {isDeepStrictEqual as equal} from 'node:util';
import path from 'node:path';
import copyManifest from './fixtures/demo-copy-v3.json' with {type:'json'};

export const DEMO_COPY_MARKER='demo-copy-v3';
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const entryKey=entry=>`${entry.collection}/${entry.id??entry.before.id}`;
function materialize(template,current){
 if(['__DEMO_STAMP__','__DEMO_TIMESTAMP__'].includes(template))return typeof current==='string'&&Number.isFinite(Date.parse(current))?current:template;
 if(Array.isArray(template))return template.map((value,index)=>materialize(value,current?.[index]));
 if(template&&typeof template==='object')return Object.fromEntries(Object.entries(template).map(([key,value])=>[key,materialize(value,current?.[key])]));
 return template;
}
function readFile(file){
 try{const stat=lstatSync(file);return stat.isSymbolicLink()||!stat.isFile()?{unsafe:true}:{content:readFileSync(file,'utf8')};}
 catch(error){if(error.code==='ENOENT')return {missing:true};throw error;}
}
function folderFor(store,locale,projectId,expectedFolder){
 const installation=store.get('meta',locale==='en'?'demo-us-files-v1':'demo-showcase-v1')?.value;
 const project=store.get('projects',projectId);
 if(!project||project.kind!=='local'||project.archived||!path.isAbsolute(installation?.root??'')||!path.isAbsolute(project.path??''))return;
 if(locale!=='en'&&!installation.records?.some(record=>record.collection==='projects'&&record.id===projectId))return;
 const root=installation.root,folder=project.path;
 try{if(!expectedFolder||path.basename(folder)!==expectedFolder||path.dirname(folder)!==root||lstatSync(root).isSymbolicLink()||lstatSync(folder).isSymbolicLink()||!lstatSync(folder).isDirectory()||realpathSync(root)!==root||realpathSync(folder)!==folder)return;}
 catch{return;}
 return folder;
}
function outputPlan(store,bundle){
 const artifacts=bundle.records.filter(record=>record.collection==='artifacts');if(!artifacts.length)return [];
 const folder=folderFor(store,bundle.locale,bundle.projectId,bundle.folder);if(!folder)return null;
 const files=[];
 for(const {before,after}of artifacts){
  if(path.basename(before.name)!==before.name||path.basename(after.name)!==after.name)return null;
  const previous=path.join(folder,before.name),destination=path.join(folder,after.name),old=readFile(previous),next=readFile(destination);
  if(old.unsafe||old.missing||![before.content,after.content].includes(old.content)||next.unsafe||!next.missing&&![before.content,after.content].includes(next.content))return null;
  files.push({path:destination,content:after.content,allowed:[before.content,after.content]});
 }
 return files;
}
function writeFile(file){
 const current=readFile(file.path);if(current.unsafe||!current.missing&&!file.allowed.includes(current.content))throw Error('Example output changed during migration; existing file was preserved.');
 if(current.content===file.content)return;
 if(current.missing){writeFileSync(file.path,file.content,{flag:'wx',mode:0o600});return;}
 const temporary=`${file.path}.${randomUUID()}.copy.tmp`;
 try{writeFileSync(temporary,file.content,{flag:'wx',mode:0o600});renameSync(temporary,file.path);}
 finally{try{unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}

/** Exact authored updates only. Never runs a model or rewrites edited task/output units. */
export function applyAuthoredDemoCopy(store,manifest,{marker,version}){
 const profile=store.get('meta','profile')?.value;
 if(profile?.demo!==true||store.get('meta',marker))return;
 const locale=profile.demoLocale==='en'?'en':'zh-CN';
 return store.transaction(()=>{
  if(store.get('meta',marker))return;
  const report={version,appliedAt:new Date().toISOString(),updated:[],alreadyCurrent:[],preserved:[],files:[]};
  const changes=manifest.changes.filter(change=>change.locale===locale),groups=new Map();
  for(const change of changes){const group=change.group??`${entryKey(change)}/${change.field}`;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(change);}
  const stateOf=change=>{const record=store.get(change.collection,change.id);if(!record)return 'preserve';if(equal(record[change.field],materialize(change.to,record[change.field])))return 'current';return equal(record[change.field],materialize(change.from,record[change.field]))?'update':'preserve';};
  const blocked=new Set([...groups].filter(([,changes])=>changes.some(change=>stateOf(change)==='preserve')).map(([key])=>key));
  for(const bundle of manifest.bundles.filter(bundle=>bundle.locale===locale)){
   const records=bundle.records.map(entry=>{const current=store.get(entry.collection,entry.before.id);return {...entry,current,before:materialize(entry.before,current),after:materialize(entry.after,current)};});
   if(records.every(entry=>equal(entry.current,entry.after))){report.alreadyCurrent.push(bundle.id);continue;}
   const changed=records.some(entry=>!entry.current||!equal(entry.current,entry.before)&&!equal(entry.current,entry.after))||(bundle.changeGroups??[]).some(group=>blocked.has(group));
   const files=changed?null:outputPlan(store,bundle);
   if(!files){report.preserved.push({id:bundle.id,reason:changed?'edited_or_removed_record':'edited_or_missing_output'});for(const group of bundle.changeGroups??[])blocked.add(group);continue;}
   for(const file of files){writeFile(file);report.files.push({name:path.basename(file.path),sha256:digest(file.content)});}
   for(const entry of records){if(equal(entry.current,entry.after))continue;store.put(entry.collection,entry.after);report.updated.push(entryKey(entry));}
  }
  for(const readme of (manifest.readmes??[]).filter(item=>item.locale===locale)){
   const project=store.get('projects',readme.projectId),folder=folderFor(store,locale,readme.projectId,readme.folder);
   if(!folder||project.name!==readme.name||blocked.has(`projects/${readme.projectId}/description`))continue;
   const file=path.join(folder,'README.md'),current=readFile(file);
   if(current.content===readme.to)continue;
   if(current.unsafe||current.missing||current.content!==readme.from){report.preserved.push({id:`${readme.projectId}/README.md`,reason:'edited_or_removed_readme'});continue;}
   writeFile({path:file,content:readme.to,allowed:[readme.from,readme.to]});report.files.push({name:`${readme.folder}/README.md`,sha256:digest(readme.to)});
  }
  for(const [group,entries]of groups){
   if(blocked.has(group)){report.preserved.push({id:group,reason:'edited_or_removed_field'});continue;}
   for(const change of entries){const state=stateOf(change),key=`${entryKey(change)}/${change.field}`;if(state==='current'){report.alreadyCurrent.push(key);continue;}if(state!=='update')throw Error('Example record changed during migration.');const current=store.get(change.collection,change.id);store.put(change.collection,{...current,[change.field]:materialize(change.to,current[change.field])});report.updated.push(key);}
  }
  store.setMeta(marker,report);return report;
 });
}

export function applyDemoCopy(store){
 return applyAuthoredDemoCopy(store,copyManifest,{marker:DEMO_COPY_MARKER,version:3});
}
