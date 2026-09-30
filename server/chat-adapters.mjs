import {HttpError} from './store.mjs';
export const chatPlatforms=['wechat','wecom','qq','feishu','dingtalk','slack','teams','telegram','discord','signal','line','messenger','imessage','instagram','whatsapp','email','sms','generic'];
const fail=message=>{throw new HttpError(400,message,'invalid_chat_export');};
const ident=(value,field)=>{if(!['string','number'].includes(typeof value)||!String(value).trim()||String(value).length>200)fail(`${field} 缺失或无效。`);return String(value);};
const epoch=(value,unit=1000)=>{if(!/^\d+(?:\.\d+)?$/.test(String(value)))fail('平台消息时间戳无效。');const ms=Number(value)*unit;if(!Number.isFinite(ms)||ms<0||ms>8640000000000000)fail('平台消息时间戳无效。');return new Date(ms).toISOString();};
const attachment='[没有可显示的文字；附件或系统记录保留在原始来源中，未下载媒体。]';
const checkRows=rows=>{if(!Array.isArray(rows)||!rows.length||rows.length>10000||rows.some(m=>!m||typeof m!=='object'||Array.isArray(m)))fail('消息列表须包含 1 至 10000 个对象。');return rows;};
function common(people,chats){return {format:'hither.chat.v1',people:[...people.values()],conversations:chats};}
function person(map,key,name){if(!map.has(key))map.set(key,{id:key,name:typeof name==='string'&&name.trim()?name:key});}
export function adaptChatExport(platform,value,body,warnings){
  if(value?.format==='hither.chat.v1')return value;
  if(platform==='slack'&&(Array.isArray(value)||Array.isArray(value?.messages))){
    const rows=checkRows(Array.isArray(value)?value:value.messages), channel=typeof value.channel==='object'?value.channel?.id:value.channel;
    const cid=ident(body.conversationId||channel||rows[0]?.channel,'Slack 频道标识（conversationId）');
    if(rows.some(m=>m.channel&&m.channel!==cid))fail('Slack 文件包含不同频道，请按频道拆分导入。');
    const people=new Map(),users=new Map((Array.isArray(value.users)?value.users:[]).map(u=>[u.id,u.real_name||u.name]));
    const messages=rows.map(m=>{const sender=ident(m.user||m.bot_id||m.editor_id||'slack-system','Slack 发送人');person(people,sender,users.get(sender)||m.username);return {id:ident(m.ts,'Slack ts'),senderId:sender,text:typeof m.text==='string'&&m.text.trim()?m.text:attachment,time:epoch(m.ts)};});
    warnings.push('Slack 原生文件以用户 ID 显示联系人；频道标识须与原导出一致。线程、编辑与附件字段留在原始来源中，不连接账号或下载附件。');
    return common(people,[{id:cid,title:value.title||value.channel?.name||cid,kind:'group',participantIds:[...people.keys()],messages}]);
  }
  if(platform==='telegram'&&(Array.isArray(value?.messages)||Array.isArray(value?.chats?.list))){
    const chats=Array.isArray(value.messages)?[value]:value.chats.list;if(chats.length>200)fail('每文件最多 200 个会话。');const people=new Map();
    const conversations=chats.map(chat=>{const cid=ident(chat.id,'Telegram chat.id'),participantIds=new Set();const messages=checkRows(chat.messages).map(m=>{
      const sender=ident(m.from_id||m.actor_id||'telegram-system','Telegram from_id');person(people,sender,m.from||m.actor);participantIds.add(sender);
      let content=m.text;if(Array.isArray(content))content=content.map(part=>typeof part==='string'?part:typeof part?.text==='string'?part.text:'').join('');
      if(typeof content!=='string'||!content.trim())content=attachment;
      return {id:ident(m.id,'Telegram message.id'),senderId:sender,text:content,time:epoch(m.date_unixtime)};
    });return {id:cid,title:chat.name||cid,kind:chat.type==='personal_chat'?'direct':'group',participantIds:[...participantIds],messages};});
    warnings.push('Telegram 读取 Desktop JSON 的时间戳与文字片段。成员只包含本文件有发言的人；附件、服务事件和格式信息保留在原始来源中，不下载媒体。');
    return common(people,conversations);
  }
  if(platform==='feishu'&&(Array.isArray(value?.data?.items)||Array.isArray(value?.items))){
    if(value.code!==undefined&&value.code!==0)fail('飞书文件是错误响应，无法作为消息记录导入。');
    const rows=checkRows(value.data?.items??value.items),people=new Map(),chats=new Map();
    for(const m of rows){const cid=ident(m.chat_id||body.conversationId,'飞书 chat_id'),sender=ident(m.sender?.id,'飞书 sender.id');person(people,sender,m.sender?.name);
      let content;try{content=JSON.parse(m.body?.content??'{}');}catch{fail('飞书消息 body.content 不是有效 JSON。');}
      const text=m.msg_type==='text'&&typeof content.text==='string'&&content.text.trim()?content.text:attachment;
      if(!chats.has(cid))chats.set(cid,{id:cid,title:cid,kind:'group',participantIds:[],messages:[]});const chat=chats.get(cid);if(!chat.participantIds.includes(sender))chat.participantIds.push(sender);
      chat.messages.push({id:ident(m.message_id,'飞书 message_id'),senderId:sender,text,time:epoch(m.create_time,1)});
    }
    warnings.push('飞书读取用户已保存的消息列表 JSON 响应，仅导入本页。不会调用飞书 API 或自动翻页；富文本、撤回与附件字段保留在原始来源中。');
    if(value.data?.has_more||value.has_more)warnings.push('这份飞书文件标记还有后续页。当前只导入文件已有消息，请另选其余文件。');
    return common(people,[...chats.values()]);
  }
  return value;
}
