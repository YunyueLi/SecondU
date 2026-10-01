import { applyDemoCopy } from './demo-copy.mjs';
import { applyDemoReadableCopy } from './demo-readable-copy.mjs';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import authored from './fixtures/demo-showcase.json' with {type:'json'};
import copyChanges from './fixtures/demo-showcase-copy-v2.json' with {type:'json'};
import projectNames from './fixtures/demo-showcase-project-names-v1.json' with {type:'json'};
import { applyDemoAgentSessions } from './demo-agent-sessions.mjs';
import { applyDemoNames } from './demo-names.mjs';
import { applyChineseDemoContent } from './demo-zh-content.mjs';

const marker='demo-showcase-v1';
const copyMarker='demo-showcase-copy-v2';
const hash=value=>createHash('sha256').update(value).digest('hex');

function updateAuthoredCopy(store,installation,changes,migrationMarker){
  if(store.get('meta',migrationMarker))return;
  const report={appliedAt:new Date().toISOString(),updated:[],preserved:[],alreadyCurrent:[]};
  store.transaction(()=>{
    for(const change of changes){
      const key=`${change.collection}/${change.id}/${change.field}`;
      const original=installation.records?.find(item=>item.collection===change.collection&&item.id===change.id);
      const record=store.get(change.collection,change.id);
      if(!original||!record){report.preserved.push(key);continue;}
      if(record[change.field]===change.to){report.alreadyCurrent.push(key);continue;}
      // Only replace this exact authored field. Messages, versions and all other
      // user edits survive even when the complete record no longer has its seed hash.
      if(record[change.field]!==change.from){report.preserved.push(key);continue;}
      const updated={...record,[change.field]:change.to};
      const unchangedRecord=hash(JSON.stringify(record))===original.sha256;
      store.put(change.collection,updated);
      if(unchangedRecord)original.sha256=hash(JSON.stringify(updated));
      report.updated.push({key,before:hash(change.from),after:hash(change.to),otherFieldsPreserved:true});
    }
    store.setMeta(marker,installation);
    store.setMeta(migrationMarker,report);
  });
}
function updateAuthoredCopies(store,installation){
  updateAuthoredCopy(store,installation,copyChanges,copyMarker);
  updateAuthoredCopy(store,installation,projectNames,'demo-showcase-project-names-v1');
}
function directory(base,name){
  const target=path.join(base,name);
  if(existsSync(target)&&lstatSync(target).isSymbolicLink())throw new Error('Example folder cannot be a symbolic link.');
  mkdirSync(target,{recursive:true,mode:0o700});
  if(realpathSync(target)!==target)throw new Error('Example folder must remain in its original location.');
  return target;
}
function writeNew(file,content){
  if(existsSync(file)){
    if(lstatSync(file).isSymbolicLink()||!lstatSync(file).isFile()||readFileSync(file,'utf8')!==content)throw new Error('An existing example file differs from the authored version. It was preserved.');
    return;
  }
  writeFileSync(file,content,{flag:'wx',mode:0o600});
}

/** Authored, inspectable demonstration records; never executes a model or a tool. */
export function ensureDemoShowcase(store){
  if(!store.meta('profile').demo||store.meta('profile').demoLocale==='en')return;
  applyChineseDemoContent(store);
  const installation=store.get('meta',marker)?.value;
  if(installation){updateAuthoredCopies(store,installation);applyDemoAgentSessions(store);applyDemoNames(store);applyDemoCopy(store);applyDemoReadableCopy(store);return;}
  const data=structuredClone(authored);
  const spaceKey=hash(store.directory).slice(0,12);
  const parent=directory(path.dirname(store.protectedDataDirectory??store.directory),'.secondu-examples');
  const root=directory(parent,spaceKey);
  for(const project of data.projects){
    project.path=directory(root,project.showcaseFolder);delete project.showcaseFolder;
    writeNew(path.join(project.path,'README.md'),`# ${project.name}\n\n${project.description}\n\n${data.sources[0].text.split('\n')[0]}\n`);
  }
  for(const artifact of data.artifacts){
    const task=data.tasks.find(item=>item.id===artifact.taskId),project=data.projects.find(item=>item.id===task.projectId);
    writeNew(path.join(project.path,artifact.name),artifact.content);
  }
  const report={installedAt:new Date().toISOString(),root,records:[],preserved:[]};
  store.transaction(()=>{
    for(const [collection,records] of Object.entries(data))for(const record of records){
      if(store.get(collection,record.id)){report.preserved.push(`${collection}/${record.id}`);continue;}
      store.put(collection,record);report.records.push({collection,id:record.id,sha256:hash(JSON.stringify(record))});
    }
    store.setMeta(marker,report);
  });
  updateAuthoredCopies(store,report);
  applyDemoAgentSessions(store);
  applyDemoNames(store);
  applyDemoCopy(store);
  applyDemoReadableCopy(store);
  return report;
}
