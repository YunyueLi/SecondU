import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import authored from './fixtures/demo-us.json' with {type:'json'};

export const US_MESSAGE_LINKS_MARKER='demo-us-message-links-v1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pick=(value,fields)=>Object.fromEntries(fields.filter(field=>value[field]!==undefined).map(field=>[field,structuredClone(value[field])]));
const messageFields=['id','role','content','createdAt','agentId','attachmentIds','recipientIds','replyToMessageId'];

/** Index existing authored conversations; never invent a reply or replay a task. */
export function ensureUSMessageLinks(store){
 const profile=store.meta('profile');
 if(profile?.demo!==true||profile.demoLocale!=='en'||!store.get('meta','demo-us-files-v1')||store.get('meta',US_MESSAGE_LINKS_MARKER))return;
 return store.transaction(()=>{
  if(store.get('meta',US_MESSAGE_LINKS_MARKER))return;
  const report={version:1,kind:'authored_room_history_index',source:'server/fixtures/demo-us.json',appliedAt:new Date().toISOString(),indexed:[],preserved:[]};
  for(const baseline of authored.agentRooms){
   const room=store.get('agentRooms',baseline.id),taskId=`demo-us-history-${baseline.id.slice('demo-us-room-'.length)}`;
   const preserve=reason=>report.preserved.push({roomId:baseline.id,reason});
   // A changed title, roster, timestamp, reaction, message or link protects the
   // entire conversation. Removed records and occupied stable IDs stay absent.
   if(!room||!isDeepStrictEqual(room,baseline)){preserve(room?'room_changed':'room_removed');continue;}
   if(store.get('tasks',taskId)){preserve('task_id_collision');continue;}
   if(!room.agentIds.every(id=>store.get('agents',id))||room.projectId&&!store.get('projects',room.projectId)||room.taskIds.some(id=>!store.get('tasks',id))){preserve('reference_removed');continue;}
   const firstUser=room.messages.find(message=>message.role==='user');
   if(!firstUser||new Set(room.messages.map(message=>message.id)).size!==room.messages.length){preserve('ambiguous_history');continue;}
   const task={...pick(room,['title','projectId','agentIds','digitalTwinEnabled','connectorIds','team','approvalMode','createdAt','updatedAt']),id:taskId,roomId:room.id,prompt:firstUser.content,mode:'demo',status:'completed',interaction:'chat',contextFactIds:[],messages:room.messages.map(message=>pick(message,messageFields)),events:[],artifactIds:[],approvals:[]};
   const indexed={...room,messages:room.messages.map(message=>({...message,taskId,taskMessageId:message.id})),taskIds:[...room.taskIds,taskId]};
   store.put('tasks',task);store.put('agentRooms',indexed);
   report.indexed.push({roomId:room.id,taskId,sourceSha256:digest(room),taskSha256:digest(task),messageIds:room.messages.map(message=>message.id)});
  }
  store.setMeta(US_MESSAGE_LINKS_MARKER,report);return report;
 });
}
