import {chatPlatforms,adaptChatExport} from './chat-adapters.mjs';
import { createHash } from 'node:crypto';
import { HttpError, id, now } from './store.mjs';
import { choice, text } from './domain.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=(prefix,...parts)=>`${prefix}-${hash(JSON.stringify(parts)).slice(0,32)}`;
const platforms=chatPlatforms;
function rawString(value,field,max=30000){text(value,field,max);return value;}
function list(value,field,max){if(!Array.isArray(value)||value.length>max)throw new HttpError(400,`${field} 必须是数组，最多 ${max} 项。`);return value;}
function object(value,field){if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,`${field} 必须是对象。`);return value;}
function stamp(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new HttpError(400,'消息时间须为带时区的 ISO 8601 时间。');return new Date(value).toISOString();}
function normalize(body){
  const platform=choice(body.platform,platforms,'platform'),filename=text(body.filename,'filename',300),content=rawString(body.content,'content',1024*1024);
  if(Buffer.byteLength(content)>1024*1024)throw new HttpError(413,'聊天文件最多 1 MiB，请按会话拆分。');
  let value;try{value=JSON.parse(content.replace(/^\uFEFF/,''));}catch{throw new HttpError(400,'当前仅接受 UTF-8 JSON 文件，请按导入协议转换；尚未连接第三方账号。');}
  if(!value||typeof value!=='object'||Array.isArray(value)&&platform!=='slack')throw new HttpError(400,'聊天 JSON 根节点应为对象；Slack 可以选择单频道消息数组。');
  const sha256=hash(content),warnings=[];
  const accountId=text(body.accountId||value.accountId||`file:${sha256}`,'accountId',200);
  if(body.accountId&&value.accountId&&body.accountId!==value.accountId)throw new HttpError(400,'填写的账号标识与文件 accountId 不一致。');
  if(!body.accountId&&!value.accountId)warnings.push('没有填写账号标识。本文件按摘要独立归档，不与其他文件自动合并；连续导入同一账号时请填写稳定标识。');
  value=adaptChatExport(platform,value,body,warnings);
  let people,conversations;
  if(value.format==='hither.chat.v1'){
    if(value.platform&&value.platform!==platform)throw new HttpError(400,'所选平台与文件 platform 不一致。');
    people=list(value.people,'people',500).map(value=>{const p=object(value,'person');return {id:text(p.id,'people.id',200),name:text(p.name,'people.name',200),isSelf:p.isSelf===true};});
    if(new Set(people.map(p=>p.id)).size!==people.length)throw new HttpError(400,'people.id 不能重复。');
    const personIds=new Set(people.map(p=>p.id));
    conversations=list(value.conversations,'conversations',200).map(c=>{
      object(c,'conversation');
      const participantIds=[...new Set(list(c.participantIds,'participantIds',500).map(p=>text(p,'participantId',200)))];
      if(!participantIds.length||participantIds.some(p=>!personIds.has(p)))throw new HttpError(400,'会话参与人必须存在于 people。');
      const messages=list(c.messages,'messages',10000).map(m=>{
        object(m,'message');
        if(!participantIds.includes(m.senderId))throw new HttpError(400,'每条消息的 senderId 必须属于该会话参与人。');
        return {id:text(m.id,'message.id',200),senderId:m.senderId,content:rawString(m.text??m.content,'message.text'),time:stamp(m.time)};
      });
      return {id:text(c.id,'conversation.id',200),title:text(c.title,'conversation.title',300),kind:choice(c.kind??(participantIds.length>2?'group':'direct'),['direct','group'],'kind'),participantIds,messages};
    });
  } else if(platform==='instagram'&&Array.isArray(value.participants)&&Array.isArray(value.messages)){
    const names=[...new Set([...list(value.participants,'participants',500).map(p=>text(object(p,'participant').name,'participant.name',200)),...list(value.messages,'messages',10000).map(m=>text(object(m,'message').sender_name,'sender_name',200))])];
    if(names.length>500)throw new HttpError(400,'参与人最多 500 位。');
    people=names.map(name=>({id:name,name,isSelf:false}));
    const messages=value.messages.map(m=>{
      if(!Number.isSafeInteger(m.timestamp_ms)||m.timestamp_ms<0||m.timestamp_ms>8640000000000000)throw new HttpError(400,'Instagram timestamp_ms 无效。');
      const attachmentKeys=['photos','videos','audio_files','files','share','sticker','gifs'].filter(k=>m[k]);
      const content=typeof m.content==='string'&&m.content.trim()?rawString(m.content,'content'):attachmentKeys.length?`[附件记录：${attachmentKeys.join('、')}。文件未下载，原始字段保留在来源中。]`:'[没有文字内容的原始记录，详见来源。]';
      return {id:typeof m.id==='string'?m.id:hash(JSON.stringify([m.sender_name,m.timestamp_ms,m.content??'',attachmentKeys.map(k=>m[k])])),senderId:m.sender_name,content,time:new Date(m.timestamp_ms).toISOString()};
    });
    conversations=[{id:text(value.thread_path||stable('thread',value.title??'',...names.sort()),'thread_path',300),title:text(value.title||names.join('、'),'title',300),kind:names.length>2?'group':'direct',participantIds:names,messages}];
    warnings.push('Instagram 导出以名称识别参与人，无法据此证明跨文件真实身份；同名人物请先核对账号与会话。附件只保存原始引用，未下载媒体。');
    warnings.push('没有平台消息 ID 时使用发送人、时间和内容摘要去重；完全相同的导出记录无法区分为两次独立发送。');
  } else throw new HttpError(400,`${platform==='generic'?'通用':platform} 文件须使用 hither.chat.v1 规范 JSON；Instagram 也接受原始 message_*.json。未连接平台账号或读取加密数据库。`);
  if(!conversations.length)throw new HttpError(400,'文件没有可导入会话。');
  if(new Set(conversations.map(c=>c.id)).size!==conversations.length)throw new HttpError(400,'同一文件 conversation.id 不能重复，请先合并对应消息。');
  if(conversations.reduce((n,c)=>n+c.messages.length,0)>10000)throw new HttpError(413,'每文件最多 10000 条消息。');
  for(const c of conversations){const seen=new Map();for(const m of c.messages){const previous=seen.get(m.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(m))throw new HttpError(409,'文件内相同消息 ID 的内容冲突，请先核对原始导出。','import_conflict');seen.set(m.id,m);}c.messages=[...seen.values()];}
  return {platform,filename,content,sha256,accountId,people,conversations,warnings};
}
function identifiers(data){return {person:external=>stable('import-person',data.platform,data.accountId,external),conversation:external=>stable('import-chat',data.platform,data.accountId,external),message:(chat,external)=>stable('import-message',data.platform,data.accountId,chat,external),importId:stable('chat-import',data.platform,data.accountId,data.sha256)};}
function inspect(store,data){
  const ids=identifiers(data),counts={people:data.people.length,conversations:data.conversations.length,messages:0,newPeople:0,newConversations:0,newMessages:0,duplicates:0};
  counts.newPeople=data.people.filter(p=>!store.get('people',ids.person(p.id))).length;
  for(const c of data.conversations){const old=store.get('conversations',ids.conversation(c.id));if(!old)counts.newConversations++;
    for(const m of c.messages){counts.messages++;const before=old?.messages.find(x=>x.id===ids.message(c.id,m.id));if(before){if(before.content!==m.content||before.senderId!==ids.person(m.senderId)||Date.parse(before.time)!==Date.parse(m.time))throw new HttpError(409,`会话“${c.title}”的消息 ${m.id} 已存在不同内容。没有覆盖原始记录。`,'import_conflict');counts.duplicates++;}else counts.newMessages++;}
  }
  return counts;
}
export function previewChatImport(store,body,origin){
  const data=normalize(body),counts=inspect(store,data),previewId=id('chat-preview'),expiresAt=new Date(Date.now()+30*60*1000).toISOString();
  for(const preview of store.list('chatImportPreviews'))if(preview.expiresAt<now())store.delete('chatImportPreviews',preview.id);
  const previews=store.list('chatImportPreviews');if(previews.length>=20)store.delete('chatImportPreviews',previews[0].id);
  store.put('chatImportPreviews',{id:previewId,data,expiresAt,...(origin?{origin}:{})});
  const names=new Map(data.people.map(p=>[p.id,p.name]));
  return {previewId,platform:data.platform,filename:data.filename,sha256:data.sha256,accountId:data.accountId,counts,warnings:[...data.warnings,...(data.conversations.some(c=>c.messages.length>50)?['预览每个会话显示前 50 条消息，确认导入将保留文件中的全部有效消息。']:[])],conversations:data.conversations.map(c=>({externalId:c.id,title:c.title,kind:c.kind,participants:c.participantIds.map(p=>names.get(p)),messageCount:c.messages.length,messages:c.messages.slice(0,50).map(m=>({sender:names.get(m.senderId),content:m.content,time:m.time}))})),expiresAt};
}
export function commitChatImport(store,previewId,imBinding){
  const preview=store.require('chatImportPreviews',text(previewId,'previewId',200));
  if(preview.origin?.kind==='im-cli'&&(!imBinding||imBinding.connectionId!==preview.origin.connectionId||store.require('imConnections',imBinding.connectionId).revision!==imBinding.revision))throw new HttpError(409,'通信记录请从原连接重新核对后保存。','im_preview_binding');
  if(preview.expiresAt<now())throw new HttpError(409,'导入预览已过期，请重新选择文件并核对。','preview_expired');
  const data=preview.data,ids=identifiers(data),prior=store.get('chatImports',ids.importId);
  if(prior)return {...prior.result,added:{people:0,conversations:0,messages:0},alreadyImported:true};
  const counts=inspect(store,data),sourceId=`source-${ids.importId}`,stampNow=now();
  const result={importId:ids.importId,sourceId,conversationIds:data.conversations.map(c=>ids.conversation(c.id)),added:{people:counts.newPeople,conversations:counts.newConversations,messages:counts.newMessages},duplicates:counts.duplicates,alreadyImported:false};
  store.transaction(()=>{
    store.put('sources',{id:sourceId,title:`${data.filename}（${data.platform} ${preview.origin?.kind==='im-cli'?'通信工具读取':'文件导入'}）`,kind:'conversation',text:data.content,createdAt:stampNow,demo:false,import:{platform:data.platform,accountId:data.accountId,filename:data.filename,sha256:data.sha256,importedAt:stampNow,...(preview.origin?{origin:preview.origin}:{})}});
    for(const p of data.people){const pid=ids.person(p.id),old=store.get('people',pid);store.put('people',old?{...old,sourceIds:[...new Set([...old.sourceIds,sourceId])]}:{id:pid,name:p.name,role:p.isSelf?'导出记录中的本人':'导入的联系人',description:preview.origin?.kind==='im-cli'?'来自用户连接的通信工具，身份和关系尚未自动确认。':'来自用户选择的聊天文件，身份和关系尚未自动确认。',sourceIds:[sourceId]});}
    for(const c of data.conversations){
      const cid=ids.conversation(c.id),old=store.get('conversations',cid),messages=[...(old?.messages??[])];
      for(const m of c.messages){const mid=ids.message(c.id,m.id),position=messages.findIndex(x=>x.id===mid);if(position>=0){const previous=messages[position];messages[position]={...previous,sourceIds:[...new Set([previous.sourceId,...(previous.sourceIds??[]),sourceId])]};}else messages.push({id:mid,externalId:m.id,senderId:ids.person(m.senderId),content:m.content,time:m.time,sourceId,sourceIds:[sourceId]});}
      messages.sort((a,b)=>a.time.localeCompare(b.time));
      const personIds=[...new Set([...(old?.personIds??[]),...c.participantIds.map(ids.person)])];
      store.put('conversations',{...old,id:cid,title:old?.title??c.title,kind:personIds.length>2?'group':old?.kind??c.kind,personIds,messages,platform:data.platform,accountId:data.accountId,externalId:c.id,demo:false});
    }
    store.put('chatImports',{id:ids.importId,result,createdAt:stampNow});
  });
  return result;
}
