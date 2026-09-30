import { applyDemoCopy } from './demo-copy.mjs';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import authored from './fixtures/demo-us.json' with {type:'json'};

export const US_DEMO_VERSION=1;
const marker='demo-us-files-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const isUSDemoProfile=profile=>profile?.demo===true&&profile?.demoLocale==='en';

/** Independent fictional American records. This never translates another seed. */
export function createUSSeed(stamp=new Date().toISOString()){
 const data=JSON.parse(JSON.stringify(authored).replaceAll('__DEMO_TIMESTAMP__',stamp));
 delete data.fixtureVersion;
 return data;
}
function directory(parent,name){
 const target=path.join(parent,name);
 if(existsSync(target)&&(lstatSync(target).isSymbolicLink()||!lstatSync(target).isDirectory()))throw Error('The American example folder is unavailable.');
 mkdirSync(target,{recursive:true,mode:0o700});
 if(realpathSync(target)!==target)throw Error('The American example folder must remain in its original location.');
 return target;
}
function newFile(file,content,report){
 if(existsSync(file)){
  if(lstatSync(file).isSymbolicLink()||!lstatSync(file).isFile()||readFileSync(file,'utf8')!==content){report.preserved.push({path:file,reason:'existing_file'});return;}
 }else writeFileSync(file,content,{flag:'wx',mode:0o600});
 report.files.push({path:file,sha256:hash(content)});
}

/** Materialize only these authored projects. User folders and edits are retained. */
export function ensureUSDemoFiles(store){
 if(!isUSDemoProfile(store.meta('profile')))return;
 if(store.get('meta',marker)){applyDemoCopy(store);return;}
 const parent=directory(path.dirname(store.protectedDataDirectory??store.directory),'.secondu-examples');
 const root=directory(parent,`us-${hash(store.directory).slice(0,12)}`);
 const report={version:US_DEMO_VERSION,installedAt:new Date().toISOString(),root,files:[],preserved:[]};
 const updates=[];
 for(const original of authored.projects){
  const current=store.get('projects',original.id);
  if(!current||current.path||current.demoFolder!==original.demoFolder){report.preserved.push({id:original.id,reason:'modified_or_missing_project'});continue;}
  const folder=directory(root,original.demoFolder);
  const project={...current,path:folder,execution:{status:'ready'}};delete project.demoFolder;
  newFile(path.join(folder,'README.md'),`# ${project.name}\n\n${project.description}\n\nFictional American example. These local files illustrate the saved work; no message, booking, purchase, or model execution has taken place.\n`,report);
  for(const originalArtifact of authored.artifacts){
   const task=authored.tasks.find(item=>item.id===originalArtifact.taskId);if(task.projectId!==project.id)continue;
   const artifact=store.get('artifacts',originalArtifact.id);
   if(!artifact||artifact.name!==originalArtifact.name||artifact.content!==originalArtifact.content){report.preserved.push({id:originalArtifact.id,reason:'modified_or_missing_artifact'});continue;}
   if(path.basename(artifact.name)!==artifact.name)throw Error('Invalid authored example filename.');
   newFile(path.join(folder,artifact.name),artifact.content,report);
  }
  updates.push(project);
 }
 store.transaction(()=>{for(const project of updates)store.put('projects',project);store.setMeta(marker,report);});
 applyDemoCopy(store);
 return report;
}
