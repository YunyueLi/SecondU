import {isDeepStrictEqual as equal} from 'node:util';
import {applyAuthoredDemoCopy} from './demo-copy.mjs';
import copyBaseline from './fixtures/demo-copy-v3.json' with {type:'json'};
import usBaseline from './fixtures/demo-us.json' with {type:'json'};

export const DEMO_READABLE_COPY_MARKER='demo-readable-copy-v1';

// Historical fixtures remain unchanged so installed copies can be recognized
// exactly. These replacements are applied only to the authored templates here,
// never to user text or a runtime record found by a loose string match.
function readableArtifact(original){
 const artifact=structuredClone(original);
 const text=value=>value
  .replace(/^(#{1,6} [^\n]+) · 初稿$/gm,'$1（初稿）')
  .replace('# Dad’s birthday weekend · November 13–15','# Dad’s birthday weekend: November 13–15')
  .replace('# Family passes · staff note draft','# Family passes: staff note draft')
  .replace('Portland · August–September 2026','Portland. August–September 2026.');
 artifact.content=text(artifact.content);
 artifact.versions=artifact.versions.map(version=>({...version,content:text(version.content)}));
 return artifact;
}

const chineseBundles=copyBaseline.bundles.filter(bundle=>bundle.locale==='zh-CN').flatMap(bundle=>{
 const records=bundle.records.map(entry=>({collection:entry.collection,before:structuredClone(entry.after),after:entry.collection==='artifacts'?readableArtifact(entry.after):structuredClone(entry.after)}));
 return records.some(entry=>!equal(entry.before,entry.after))?[{id:bundle.id,locale:bundle.locale,projectId:bundle.projectId,folder:bundle.folder,records}]:[];
});

function americanBundles(store){
 return usBaseline.artifacts.flatMap(artifact=>{
  const after=readableArtifact(artifact);
  if(equal(artifact,after))return [];
  const task=usBaseline.tasks.find(item=>item.id===artifact.taskId),project=usBaseline.projects.find(item=>item.id===task.projectId);
  const records=[{collection:'tasks',before:task,after:task},{collection:'artifacts',before:artifact,after}];
  const room=usBaseline.agentRooms.find(item=>item.id===task.roomId);
  if(room){
   // The previous authored history index only added these deterministic links.
   // Both known states are accepted; edited messages or added tasks match neither.
   const taskId=`demo-us-history-${room.id.slice('demo-us-room-'.length)}`;
   const indexed={...room,messages:room.messages.map(message=>({...message,taskId,taskMessageId:message.id})),taskIds:[...room.taskIds,taskId]};
   const expected=equal(store.get('agentRooms',room.id),indexed)?indexed:room;
   records.push({collection:'agentRooms',before:expected,after:expected});
  }
  return [{id:task.id,locale:'en',projectId:project.id,folder:project.demoFolder,records}];
 });
}

/** Fresh and previously installed examples take the same guarded upgrade path. */
export function applyDemoReadableCopy(store){
 return applyAuthoredDemoCopy(store,{changes:[],bundles:[...chineseBundles,...americanBundles(store)]},{marker:DEMO_READABLE_COPY_MARKER,version:1});
}
