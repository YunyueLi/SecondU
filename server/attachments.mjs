import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdirSync,lstatSync,realpathSync,existsSync,readFileSync,unlinkSync} from 'node:fs';
import {HttpError,id,now,atomicWrite} from './store.mjs';

import { ATTACHMENT_LIMIT, ATTACHMENT_COUNT, imageMime } from './attachment-input.mjs';
export { ATTACHMENT_LIMIT, ATTACHMENT_COUNT, MULTIMODAL_REQUEST_LIMIT, imageMime, inlineImage } from './attachment-input.mjs';
export const STORED_ATTACHMENT_LIMIT=64*1024*1024;
const storageLimit=256*1024*1024;
const imageTypes=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const textExtensions=new Set(['.txt','.md','.markdown','.csv','.tsv','.json','.jsonl','.yaml','.yml','.xml','.html','.htm','.css','.js','.jsx','.ts','.tsx','.py','.rs','.go','.java','.sql','.log','.sh','.toml','.ini']);
const textMimes=new Set(['application/json','application/x-ndjson','application/xml','application/javascript','application/yaml','application/toml']);
const digest=data=>createHash('sha256').update(data).digest('hex');
const invalid=message=>new HttpError(400,message,'invalid_attachment');

// Identify supported containers from their bytes. This does not decode media,
// infer its contents, or promise that the browser supports the contained codec.
export function videoMime(data){
  const boxes=(start,end)=>{const result=[];for(let offset=start;offset+8<=end;){let size=data.readUInt32BE(offset),header=8;if(size===1){if(offset+16>end)return [];const large=data.readBigUInt64BE(offset+8);if(large>BigInt(end-offset))return [];size=Number(large);header=16;}else if(size===0)size=end-offset;if(size<header||offset+size>end)return [];result.push({type:data.toString('ascii',offset+4,offset+8),start:offset+header,end:offset+size});offset+=size;if(offset===end)return result;}return [];};
  const top=boxes(0,data.length),ftyp=top.find(box=>box.type==='ftyp'&&box.end-box.start>=8),moov=top.find(box=>box.type==='moov');
  if(ftyp&&moov&&top.some(box=>box.type==='mdat'&&box.end>box.start)){
    const brand=data.toString('ascii',ftyp.start,ftyp.start+4),supported=new Set(['isom','iso2','iso3','iso4','iso5','iso6','mp41','mp42','avc1','M4V ','MSNV','qt  ']);
    const hasVideo=boxes(moov.start,moov.end).filter(box=>box.type==='trak').some(track=>boxes(track.start,track.end).filter(box=>box.type==='mdia').some(media=>boxes(media.start,media.end).some(box=>box.type==='hdlr'&&box.end-box.start>=12&&data.toString('ascii',box.start+8,box.start+12)==='vide')));
    if(supported.has(brand)&&hasVideo)return brand==='qt  '?'video/quicktime':'video/mp4';
  }
  const vint=offset=>{if(offset>=data.length||!data[offset])return;let width=1,mask=128;while(!(data[offset]&mask)){width++;mask>>=1;}if(width>8||offset+width>data.length)return;let value=BigInt(data[offset]&(mask-1));for(let index=1;index<width;index++)value=value*256n+BigInt(data[offset+index]);if(value>BigInt(Number.MAX_SAFE_INTEGER))return;return {value:Number(value),width};};
  if(data.length>=8&&data.readUInt32BE(0)===0x1a45dfa3){
    const header=vint(4);if(!header||header.value>4096)return;const end=4+header.width+header.value;if(end+5>data.length||data.readUInt32BE(end)!==0x18538067)return;
    for(let offset=4+header.width;offset<end;){const identifier=vint(offset);if(!identifier)return;const key=data.subarray(offset,offset+identifier.width).toString('hex');offset+=identifier.width;const size=vint(offset);if(!size||offset+size.width+size.value>end)return;offset+=size.width;if(key==='4282'&&data.toString('ascii',offset,offset+size.value)==='webm')return 'video/webm';offset+=size.value;}
  }
}

export function attachmentResponse(attachment,{range,method='GET'}={}){
  const video=videoMime(attachment.data),inline=attachment.kind==='image'||!!video,filename=encodeURIComponent(attachment.name).replaceAll("'",'%27');
  const headers={'Content-Type':video??(inline?attachment.mime:'application/octet-stream'),'Content-Length':attachment.size,'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${filename}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; sandbox",'Accept-Ranges':'bytes'};
  // RFC 9110 defines Range for GET; HEAD returns the full representation headers.
  if(!range||method==='HEAD')return {status:200,headers,data:attachment.data};
  const match=/^bytes=(\d*)-(\d*)$/.exec(range),size=attachment.size;
  if(!match||(!match[1]&&!match[2]))return {status:416,headers:{...headers,'Content-Length':0,'Content-Range':`bytes */${size}`}};
  const first=match[1]?Number(match[1]):undefined,last=match[2]?Number(match[2]):undefined;
  const start=first??Math.max(0,size-last),end=first===undefined?size-1:Math.min(last??size-1,size-1);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||(first===undefined&&last===0))return {status:416,headers:{...headers,'Content-Length':0,'Content-Range':`bytes */${size}`}};
  return {status:206,headers:{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`},data:attachment.data.subarray(start,end+1)};
}

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
  if(body.data.length>Math.ceil(STORED_ATTACHMENT_LIMIT/3)*4)throw new HttpError(413,'每个原件最多 64 MiB。','attachment_too_large');
  const data=Buffer.from(body.data,'base64');
  if(data.length>STORED_ATTACHMENT_LIMIT)throw new HttpError(413,'每个原件最多 64 MiB。','attachment_too_large');
  if(data.toString('base64')!==body.data)throw invalid('附件编码无效。');
  const detected=imageMime(data),video=videoMime(data);
  if(imageTypes.has(mime)&&detected!==mime)throw invalid('图片类型与文件内容不一致，请重新选择原始图片。');
  if(['video/mp4','video/quicktime','video/webm'].includes(mime)&&video!==mime)throw invalid('视频类型与文件内容不一致，请重新选择原始 MP4、MOV 或 WebM 文件。');
  let kind='file';
  if(detected){kind='image';mime=detected;}
  else if(video)mime=video;
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
export function storedAttachmentRefs(store,value=[]){
  if(!Array.isArray(value)||value.length>ATTACHMENT_COUNT||value.some(key=>typeof key!=='string'))throw invalid('每份材料最多附加 6 个已有原件。');
  const keys=[...new Set(value)];
  for(const key of keys)getAttachment(store,key);
  return keys;
}
export function attachmentRefs(store,value=[]){
  const keys=storedAttachmentRefs(store,value);
  for(const key of keys){const attachment=getAttachment(store,key);if(attachment.kind==='file')throw new HttpError(400,`“${attachment.name}”已保存在本机，但当前还不能将 ${attachment.mime} 作为模型输入。请改用 PNG、JPEG、WebP、GIF 或 UTF-8 文本文件；音视频、PDF 与其他二进制文件需要专用解析器。`,'unsupported_attachment');if(attachment.size>ATTACHMENT_LIMIT)throw new HttpError(413,'原件已保存在本机；每个模型输入附件最多 8 MiB。','model_attachment_too_large');}
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
