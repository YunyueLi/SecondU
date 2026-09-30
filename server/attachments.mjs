import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdirSync,lstatSync,realpathSync,existsSync,readFileSync,unlinkSync} from 'node:fs';
import {HttpError,id,now,atomicWrite} from './store.mjs';

import { ATTACHMENT_LIMIT, ATTACHMENT_COUNT, imageMime } from './attachment-input.mjs';
export { ATTACHMENT_LIMIT, ATTACHMENT_COUNT, MULTIMODAL_REQUEST_LIMIT, imageMime, inlineImage } from './attachment-input.mjs';
const storageLimit=256*1024*1024;
const imageTypes=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const textExtensions=new Set(['.txt','.md','.markdown','.csv','.tsv','.json','.jsonl','.yaml','.yml','.xml','.html','.htm','.css','.js','.jsx','.ts','.tsx','.py','.rs','.go','.java','.sql','.log','.sh','.toml','.ini']);
const textMimes=new Set(['application/json','application/x-ndjson','application/xml','application/javascript','application/yaml','application/toml']);
const digest=data=>createHash('sha256').update(data).digest('hex');
const invalid=message=>new HttpError(400,message,'invalid_attachment');

function decodeText(data){
  if(data.includes(0))throw invalid('文本附件包含二进制内容，请导出为 UTF-8 文本。');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{throw invalid('文本附件不是有效 UTF-8，请转换编码后重新添加。');}
}
function directory(store,{create=false}={}){
  const root=path.join(store.directory,'attachments');
  if(create&&!existsSync(root))mkdirSync(root,{mode:0o700});
  if(!existsSync(root)||lstatSync(root).isSymbolicLink()||!lstatSync(root).isDirectory()||realpathSync(root)!==root)throw new HttpError(409,'附件存储目录不可用，请检查本机存储。','attachment_storage_unavailable');
  return root;
}
function attachmentFile(store,key){
  if(!/^attachment-[a-f0-9-]{36}$/.test(key))throw new HttpError(404,'附件不存在。','attachment_not_found');
  return path.join(directory(store),`${key}.bin`);
}
export function publicAttachment(record){
  const {id,name,mime,size,kind,createdAt}=record;
  return {id,name,mime,size,kind,createdAt,url:`/api/attachments/${encodeURIComponent(id)}`};
}
export function saveAttachment(store,body){
  if(Object.keys(body).some(key=>!['name','mime','data'].includes(key)))throw invalid('附件只接受文件名、类型与原始文件内容。');
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>240||/[\x00-\x1f\x7f/\\]/.test(body.name))throw invalid('附件文件名无效。');
  const name=body.name.trim();
  let mime=typeof body.mime==='string'?body.mime.trim().toLowerCase():'';
  if(mime==='image/jpg')mime='image/jpeg';
  if(mime&&!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime))throw invalid('附件类型无效。');
  if(typeof body.data!=='string'||body.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data))throw invalid('附件必须使用有效的 base64 编码。');
  if(body.data.length>Math.ceil(ATTACHMENT_LIMIT/3)*4)throw new HttpError(413,'每个附件最多 8 MiB。','attachment_too_large');
  const data=Buffer.from(body.data,'base64');
  if(data.length>ATTACHMENT_LIMIT)throw new HttpError(413,'每个附件最多 8 MiB。','attachment_too_large');
  if(data.toString('base64')!==body.data)throw invalid('附件编码无效。');
  const detected=imageMime(data);
  if(imageTypes.has(mime)&&detected!==mime)throw invalid('图片类型与文件内容不一致，请重新选择原始图片。');
  let kind='file';
  if(detected){kind='image';mime=detected;}
  else if(mime.startsWith('text/')||textMimes.has(mime)||(!mime||mime==='application/octet-stream')&&textExtensions.has(path.extname(name).toLowerCase())){
    decodeText(data);kind='text';mime=mime&&mime!=='application/octet-stream'?mime:'text/plain';
  }
  mime||='application/octet-stream';
  const existing=store.list('attachments');
  if(existing.length>=2000||existing.reduce((total,item)=>total+item.size,0)+data.length>storageLimit)throw new HttpError(413,'当前空间的附件存储已达 256 MiB 或 2000 个文件上限。','attachment_storage_limit');
  directory(store,{create:true});
  const record={id:id('attachment'),name,mime,size:data.length,kind,createdAt:now(),sha256:digest(data)};
  const file=attachmentFile(store,record.id);atomicWrite(file,data);
  try{store.put('attachments',record);}catch(error){unlinkSync(file);throw error;}
  return publicAttachment(record);
}
export function getAttachment(store,key){
  const record=store.get('attachments',key);
  if(!record)throw new HttpError(404,'当前空间没有这个附件。','attachment_not_found');
  const file=attachmentFile(store,key);
  if(!existsSync(file)||lstatSync(file).isSymbolicLink()||!lstatSync(file).isFile()||realpathSync(file)!==file)throw new HttpError(409,'附件原件缺失或已被替换，请重新添加。','attachment_unavailable');
  const data=readFileSync(file);
  if(data.length!==record.size||digest(data)!==record.sha256)throw new HttpError(409,'附件原件已变化，请重新添加，避免发送错误版本。','attachment_changed');
  return {...record,data};
}
export function attachmentRefs(store,value=[]){
  if(!Array.isArray(value)||value.length>ATTACHMENT_COUNT||value.some(key=>typeof key!=='string'))throw invalid('每条消息最多附加 6 个已有附件。');
  const keys=[...new Set(value)];
  for(const key of keys){const attachment=getAttachment(store,key);if(attachment.kind==='file')throw new HttpError(400,`“${attachment.name}”已保存在本机，但当前还不能将 ${attachment.mime} 作为模型输入。请改用 PNG、JPEG、WebP、GIF 或 UTF-8 文本文件；音视频、PDF 与其他二进制文件需要专用解析器。`,'unsupported_attachment');}
  return keys;
}
export function messageInput(store,content,ids){
  const attachmentIds=attachmentRefs(store,ids);
  if(content===undefined)content='';
  if(typeof content!=='string'||content.length>50000||(!content.trim()&&!attachmentIds.length))throw new HttpError(400,'请填写消息，或添加图片、文本附件。','empty_message');
  return {content:content.trim(),attachmentIds};
}

// Send selected originals as image blocks, and bounded UTF-8 contents as evidence.
// Carry recent attachments when a fresh provider thread reconstructs history.
export function taskAttachmentInput(store,task){
  const messages=[...(task.roomContext??[]),...(task.messages??[])];
  if(task.replyContext?.attachmentIds?.length)messages.push(task.replyContext);
  const newest=task.messages.filter(message=>message.role==='user').at(-1);
  if(newest)messages.push(newest);
  const keys=[...new Set([...messages].reverse().flatMap(message=>message.attachmentIds??[]))];
  const selected=keys.slice(0,ATTACHMENT_COUNT).reverse(),input=[],evidence=[];
  let remaining=64000;
  for(const key of selected){
    const attachment=getAttachment(store,key),meta=publicAttachment(attachment);
    if(attachment.kind==='image'){
      input.push({type:'image',url:`data:${attachment.mime};base64,${attachment.data.toString('base64')}`});
      evidence.push({id:key,name:meta.name,kind:'image',imageIndex:input.length,mime:meta.mime,...(meta.mime==='image/gif'?{limitation:'只分析首帧，不能据此推断动画内容。'}:{})});
    }else if(attachment.kind==='text'){
      const full=decodeText(attachment.data),excerpt=full.slice(0,Math.min(32000,remaining));remaining-=excerpt.length;
      evidence.push({id:key,name:meta.name,kind:'text',text:excerpt,truncated:excerpt.length<full.length,totalCharacters:full.length});
    }else throw new HttpError(400,`附件“${meta.name}”的格式尚不支持模型输入。`,'unsupported_attachment');
  }
  return {input,evidence,omittedCount:keys.length-selected.length};
}
