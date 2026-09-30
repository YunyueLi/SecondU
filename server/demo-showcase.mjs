import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import authored from './fixtures/demo-showcase.json' with {type:'json'};
import translations from '../shared/demo-showcase-translations.json' with {type:'json'};

const marker='demo-showcase-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
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
  if(!store.meta('profile').demo||store.get('meta',marker))return;
  const data=structuredClone(authored);
  const spaceKey=hash(store.directory).slice(0,12);
  const parent=directory(path.dirname(store.protectedDataDirectory??store.directory),'.secondu-examples');
  const root=directory(parent,spaceKey);
  for(const project of data.projects){
    project.path=directory(root,project.showcaseFolder);delete project.showcaseFolder;
    const translated=translations.projects[project.id];
    writeNew(path.join(project.path,'README.md'),`# ${project.name}\n\n${project.description}\n\n${translated[project.name]}\n\n${translated[project.description]}\n\n${data.sources[0].text.split('\n')[0]}\n`);
  }
  for(const artifact of data.artifacts){
    const task=data.tasks.find(item=>item.id===artifact.taskId),project=data.projects.find(item=>item.id===task.projectId);
    writeNew(path.join(project.path,artifact.name),artifact.content);
    const english=translations.artifacts[artifact.id]?.[artifact.content];
    if(english)writeNew(path.join(project.path,artifact.name.replace(/\.md$/,'.en.md')),english);
  }
  const report={installedAt:new Date().toISOString(),root,records:[],preserved:[]};
  store.transaction(()=>{
    for(const [collection,records] of Object.entries(data))for(const record of records){
      if(store.get(collection,record.id)){report.preserved.push(`${collection}/${record.id}`);continue;}
      store.put(collection,record);report.records.push({collection,id:record.id,sha256:hash(JSON.stringify(record))});
    }
    store.setMeta(marker,report);
  });
  return report;
}
