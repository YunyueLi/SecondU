import { spawn } from 'node:child_process';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { HttpError, id, now } from './store.mjs';
import { text, choice } from './domain.mjs';
import { chatPlatforms } from './chat-adapters.mjs';
import { previewChatImport, commitChatImport } from './imports.mjs';

const PROTOCOL='hither.im.v1';
const sendChannels=['discord','googlechat','imessage','matrix','mattermost','msteams','signal','slack','telegram','whatsapp'];
const readChannels=['slack','discord']; // These two output schemas are explicitly normalized below.
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid=message=>{throw new HttpError(400,message,'im_invalid');};
function scalar(value,label,max=300){return text(value,label,max);}
function safeCode(error){return ['ENOENT','EACCES'].includes(error?.code)?error.code:error?.code==='im_timeout'?'timeout':'cli_error';}

/** Execute a configured local program directly, without shell evaluation or logging its output. */
export function runImCli(command,args,input,{timeout=15000,maxBytes=1024*1024}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output=[],bytes=0,finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new HttpError(504,'通信工具超时，请检查工具中的实际状态。','im_timeout'));},timeout);
    child.on('error',error=>finish(error));
    child.stdout.on('data',part=>{bytes+=part.length;if(bytes>maxBytes){child.kill('SIGKILL');finish(new HttpError(502,'通信工具返回内容过多，请缩小读取范围。','im_output_limit'));}else output.push(part);});
    // stderr may contain credential or account diagnostics; never return it to the browser.
    child.stderr.on('data',part=>{bytes+=part.length;if(bytes>maxBytes){child.kill('SIGKILL');finish(new HttpError(502,'通信工具输出超过限制。','im_output_limit'));}});
    child.stdin.on('error',()=>{});
    child.on('close',code=>{
      if(code!==0)return finish(new HttpError(502,`通信工具未完成操作（退出码 ${code??'unknown'}）。请在工具内检查账号。`,'im_cli_error'));
      try{const value=JSON.parse(Buffer.concat(output).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();finish(undefined,value);}catch{finish(new HttpError(502,'通信工具没有返回有效 JSON，未认定操作成功。','im_invalid_output'));}
    });
    child.stdin.end(input?JSON.stringify(input):undefined);
  });
}
function normalizeOpenClawRead(connection,value){
  if(value.action!=='read'||value.channel!==connection.channel||value.dryRun===true||value.ok===false||value.payload?.ok===false)invalid('读取结果与配置的渠道不一致，或工具返回了失败。');
  const rows=value.payload?.messages;
  if(!Array.isArray(rows)||rows.length>100)invalid('当前 OpenClaw 读取结果格式不受支持，未导入任何消息。');
  const people=new Map(),messages=rows.map(row=>{
    let senderId,name,messageId,time,content;
    if(connection.channel==='slack'){
      senderId=row.user??row.bot_id;name=row.username??senderId;messageId=row.ts;content=row.text;
      if(!/^\d+(?:\.\d+)?$/.test(String(row.ts)))invalid('Slack 消息缺少有效原始时间。');
      const ms=Number(row.ts)*1000;if(!Number.isFinite(ms)||ms>8640000000000000)invalid('Slack 时间超出范围。');time=new Date(ms).toISOString();
    }else{
      senderId=row.author?.id;name=row.author?.global_name??row.author?.username??senderId;messageId=row.id;time=row.timestamp;content=row.content;
    }
    senderId=scalar(senderId,'senderId',200);messageId=scalar(messageId,'messageId',200);
    const target=connection.target.replace(/^channel:/,'');if((row.channel_id??row.channel)&&String(row.channel_id??row.channel)!==target)invalid('读取结果包含其他会话，未导入。');
    people.set(senderId,{id:senderId,name:scalar(name,'senderName',200),isSelf:senderId===connection.selfId});
    return {id:messageId,senderId,time,text:typeof content==='string'&&content.trim()?content:'[非文字消息；附件未下载。]'};
  });
  if(!messages.length)return {empty:true};
  return {format:'hither.chat.v1',platform:connection.platform,accountId:connection.accountId,people:[...people.values()],conversations:[{id:connection.target,title:connection.name,kind:'group',participantIds:[...people.keys()],messages}]};
}
function publicConnection(connection){const {confirmation,...rest}=connection;return rest;}
export class ImCliService{
  constructor(store,{runCli=runImCli}={}){
    this.store=store;this.runCli=runCli;this.busy=new Set();
    for(const draft of store.list('imOutbox'))if(draft.status==='sending')store.put('imOutbox',{...draft,status:'unknown',statusMessage:'上次发送期间应用退出。请到原平台核对；不会自动重发。',updatedAt:now()});
  }
  list(){return this.store.list('imConnections').map(publicConnection);}
  save(body,existing){
    if(existing&&body.revision!==existing.revision)throw new HttpError(409,'连接已被修改，请重新打开后再编辑。');
    const adapter=choice(body.adapter,['openclaw','hither-cli'],'adapter');
    const command=scalar(body.command||'openclaw','command',1000);
    if(command!=='openclaw'&&!path.isAbsolute(command))invalid('请选择本机可执行文件的绝对路径。');
    if(/[\r\n\0]/.test(command))invalid('可执行文件路径无效。');
    const channel=scalar(body.channel,'channel',100);
    if(adapter==='openclaw'&&!sendChannels.includes(channel))invalid('此 OpenClaw 渠道尚未适配。其他 CLI 可使用通用桥接协议。');
    const platform=choice(adapter==='openclaw'?(channel==='msteams'?'teams':chatPlatforms.includes(channel)?channel:'generic'):body.platform,chatPlatforms,'platform');
    const connection={id:existing?.id??id('im'),revision:(existing?.revision??0)+1,name:scalar(body.name,'name',200),adapter,command,channel,platform,accountId:scalar(body.accountId,'accountId',200),target:scalar(body.target,'target',200),selfId:typeof body.selfId==='string'?text(body.selfId,'selfId',200,false):'',createdAt:now(),status:'untested',canRead:false,canSend:false};
    if([connection.channel,connection.accountId].some(v=>v.startsWith('-')||/[\r\n\0]/.test(v))||/[\r\n\0]/.test(connection.target)||(connection.target.startsWith('-')&&!(channel==='telegram'&&/^-\d+$/.test(connection.target))))invalid('渠道、账号和目标标识无效。');
    const duplicate=this.list().find(c=>c.id!==existing?.id&&c.adapter===adapter&&c.command===command&&c.channel===channel&&c.accountId===connection.accountId&&c.target===connection.target);
    if(duplicate)throw new HttpError(409,'这个账号和会话已经添加。','im_duplicate');
    if(existing?.conversationId&&existing.accountId===connection.accountId&&existing.target===connection.target&&existing.platform===connection.platform)connection.conversationId=existing.conversationId;
    return this.store.put('imConnections',connection);
  }
  async call(connection,action,extra={}){
    if(connection.adapter==='hither-cli')return this.runCli(connection.command,[],{protocol:PROTOCOL,action,channel:connection.channel,accountId:connection.accountId,target:connection.target,...extra});
    const args=action==='probe'?['channels','status','--channel',connection.channel,'--probe','--json']:['message',action,'--channel',connection.channel,'--account',connection.accountId,`--target=${connection.target}`,'--json',...(action==='read'?['--limit','100']:[`--message=${extra.text}`])];
    return this.runCli(connection.command,args);
  }
  async probe(key){
    const connection=this.store.require('imConnections',key);let result;
    try{
      const value=await this.call(connection,'probe');let connected,canRead,canSend;
      if(connection.adapter==='hither-cli'){
        if(value.protocol!==PROTOCOL||value.accountId!==connection.accountId||value.channel!==connection.channel)invalid('CLI 探测返回的协议、账号或渠道不匹配。');
        connected=value.connected===true;canRead=connected&&value.capabilities?.read===true;canSend=connected&&value.capabilities?.send===true;
      }else{
        const account=value.channelAccounts?.[connection.channel]?.find(a=>a.accountId===connection.accountId);
        connected=!!account&&account.configured!==false&&account.running!==false&&(account.connected===true||account.probe?.ok===true);
        canRead=connected&&readChannels.includes(connection.channel);canSend=connected&&sendChannels.includes(connection.channel);
      }
      result={...connection,status:connected?'ready':'unavailable',canRead,canSend,lastCheckedAt:now(),statusMessage:connected?'账号已通过本机工具检查。':'工具未确认该账号在线。请先在通信工具中完成账号连接。'};
    }catch(error){result={...connection,status:'error',canRead:false,canSend:false,lastCheckedAt:now(),statusMessage:safeCode(error)==='ENOENT'?'没有找到通信工具，请检查安装位置。':safeCode(error)==='EACCES'?'此文件没有执行权限。':error instanceof HttpError?error.message:'无法运行通信工具，请检查本机配置。'};}
    if(this.store.require('imConnections',key).revision!==connection.revision)throw new HttpError(409,'连接在检查期间已修改，请重新检查。');
    this.store.put('imConnections',result);return result;
  }
  async preview(key){
    const connection=this.store.require('imConnections',key);
    if(!connection.canRead)throw new HttpError(409,'该连接尚未通过读取能力检查。','im_not_ready');
    let value;try{value=await this.call(connection,'read',{limit:100});}catch(error){throw new HttpError(502,error instanceof HttpError?error.message:'无法读取消息，请检查通信工具。','im_read_failed');}
    if(this.store.require('imConnections',key).revision!==connection.revision)throw new HttpError(409,'连接在读取期间已修改，请重新读取。');
    if(connection.adapter==='openclaw')value=normalizeOpenClawRead(connection,value);
    else if(value.protocol!==PROTOCOL)invalid('CLI 读取结果的协议版本不匹配。');else value=value.data;
    if(value?.empty===true)return {empty:true};
    if(value?.format!=='hither.chat.v1'||value.platform!==connection.platform||value.accountId!==connection.accountId||!Array.isArray(value.conversations)||value.conversations.length!==1||value.conversations[0].id!==connection.target)invalid('CLI 读取结果的账号、平台或会话不匹配。');
    const content=JSON.stringify(value);
    const preview=previewChatImport(this.store,{platform:connection.platform,accountId:connection.accountId,filename:`${connection.name}.json`,content},{kind:'im-cli',connectionId:key,channel:connection.channel});
    this.store.put('imPreviews',{id:preview.previewId,connectionId:key,connectionRevision:connection.revision});return preview;
  }
  commit(key,previewId){
    const binding=this.store.require('imPreviews',previewId);if(binding.connectionId!==key)throw new HttpError(409,'预览不属于这个连接。');
    if(binding.connectionRevision!==this.store.require('imConnections',key).revision)throw new HttpError(409,'读取后连接配置已改变，请重新读取。');
    const result=commitChatImport(this.store,previewId,{connectionId:key,revision:binding.connectionRevision});
    const connection=this.store.require('imConnections',key);this.store.put('imConnections',{...connection,conversationId:result.conversationIds[0],lastSyncedAt:now()});return result;
  }
  drafts(connectionId){return this.store.list('imOutbox').filter(d=>!connectionId||d.connectionId===connectionId).map(({confirmation,...d})=>d);}
  draft(key,body){
    const connection=this.store.require('imConnections',key);
    const content=scalar(body.text,'text',10000);
    const draft={id:id('im-draft'),connectionId:key,connectionRevision:connection.revision,connectionName:connection.name,channel:connection.channel,accountId:connection.accountId,target:connection.target,text:content,status:'draft',createdAt:now(),updatedAt:now()};
    this.store.put('imOutbox',draft);return draft;
  }
  prepare(draftId){
    const draft=this.store.require('imOutbox',draftId),connection=this.store.require('imConnections',draft.connectionId);
    if(draft.status!=='draft')throw new HttpError(409,'这份草稿已经提交或状态待核对，不能重复发送。');
    if(draft.connectionRevision!==connection.revision)throw new HttpError(409,'连接配置已经改变，请按新配置重新保存草稿。');
    if(!connection.canSend)throw new HttpError(409,'该连接尚未通过发送能力检查。');
    const confirmation={token:randomBytes(24).toString('hex'),digest:digest([draft.connectionId,draft.target,draft.accountId,draft.text]),expiresAt:new Date(Date.now()+5*60*1000).toISOString()};
    this.store.put('imOutbox',{...draft,confirmation});return {...draft,confirmation};
  }
  async send(draftId,body){
    let draft,connection,pending;
    this.store.transaction(()=>{
      draft=this.store.require('imOutbox',draftId);const confirmation=draft.confirmation;
      if(draft.status!=='draft'||this.busy.has(draftId)||!confirmation||confirmation.token!==body.token||confirmation.digest!==body.digest||confirmation.expiresAt<now()||body.confirmed!==true)throw new HttpError(409,'发送确认已失效或此草稿已提交，请重新查看草稿。','im_confirmation');
      connection=this.store.require('imConnections',draft.connectionId);
      if(draft.connectionRevision!==connection.revision)throw new HttpError(409,'连接配置已经改变，请按新配置重新保存草稿。');
      if(!connection.canSend)throw new HttpError(409,'连接无法发送，请重新检查。');
      pending={...draft,confirmation:undefined,status:'sending',updatedAt:now()};this.store.put('imOutbox',pending);
    });
    this.busy.add(draftId);
    let result;
    try{
      const value=await this.call(connection,'send',{text:draft.text,requestId:draft.id});
      const messageId=connection.adapter==='openclaw'?(value.messageId??value.payload?.messageId??value.payload?.result?.messageId):value.receipt?.messageId;
      const accepted=connection.adapter==='openclaw'?value.action==='send'&&value.channel===connection.channel&&value.dryRun!==true&&value.ok!==false&&value.payload?.ok!==false: value.protocol===PROTOCOL&&value.channel===connection.channel&&value.requestId===draft.id&&value.accountId===connection.accountId&&value.target===connection.target&&value.accepted===true;
      if(!accepted||typeof messageId!=='string'||!messageId.trim())throw new HttpError(502,'没有取得明确的提交回执。');
      result={...pending,status:'accepted',messageId:messageId.slice(0,300),statusMessage:'通信工具已返回提交回执；不表示对方已读。',updatedAt:now()};
    }catch(error){const knownNotRun=['ENOENT','EACCES'].includes(error?.code);result={...pending,status:knownNotRun?'failed':'unknown',statusMessage:knownNotRun?'通信工具未能启动，消息未发出。':'发送结果不确定，请到原平台核对。为避免重复发送，不会自动重试。',updatedAt:now()};}
    finally{this.busy.delete(draftId);}
    return this.store.put('imOutbox',result);
  }
}
