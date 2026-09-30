import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {HttpError} from './http-error.mjs';

export const OFFICE_TYPES=Object.freeze({
 '.docx':{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',part:'word/document.xml',root:'document',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'},
 '.xlsx':{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',part:'xl/workbook.xml',root:'workbook',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'},
 '.pptx':{mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',part:'ppt/presentation.xml',root:'presentation',contentType:'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'},
});
export const OFFICE_LIMITS=Object.freeze({entries:2000,entryBytes:16*1024*1024,totalBytes:48*1024*1024,xmlBytes:8*1024*1024});
const invalid=()=>new HttpError(400,'Office 文件不是有效的 DOCX、XLSX 或 PPTX 包。','invalid_artifact_content');
const unsafe=()=>new HttpError(400,'Office 文件含宏、嵌入执行内容或不安全的压缩条目。','office_unsafe_content');
const limit=()=>new HttpError(413,'Office 解压大小或条目数超过本机预览上限。','office_archive_limit');
export const officeType=name=>OFFICE_TYPES[path.extname(name).toLowerCase()];
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function zipCrc32(data){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function zipName(data,flags){let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{throw invalid();}if(!(flags&0x800)&&data.some(byte=>byte>127))throw invalid();if(!name||name.length>512||/[\\\x00-\x1f%:]/.test(name)||name.startsWith('/')||name.normalize('NFC')!==name||name.replace(/\/$/,'').split('/').some(part=>!part||part==='.'||part==='..'))throw unsafe();return name;}

/** Read a bounded ZIP in memory, never extract caller-controlled paths to disk. */
export function officeEntries(data){
 if(!Buffer.isBuffer(data)||data.length<22||data.length>8*1024*1024)throw invalid();
 let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50&&i+22+data.readUInt16LE(i+20)===data.length){end=i;break;}
 if(end<0||data.readUInt16LE(end+4)||data.readUInt16LE(end+6))throw invalid();
 const count=data.readUInt16LE(end+10),size=data.readUInt32LE(end+12),start=data.readUInt32LE(end+16);
 if(!count||count!==data.readUInt16LE(end+8)||count===65535||size===0xffffffff||start===0xffffffff||start+size!==end)throw invalid();
 if(count>OFFICE_LIMITS.entries)throw limit();
 const entries=new Map(),names=new Set(),ranges=[];let cursor=start,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>end||data.readUInt32LE(cursor)!==0x02014b50)throw invalid();
  const flags=data.readUInt16LE(cursor+8),method=data.readUInt16LE(cursor+10),crc=data.readUInt32LE(cursor+16),compressed=data.readUInt32LE(cursor+20),length=data.readUInt32LE(cursor+24),nameLength=data.readUInt16LE(cursor+28),extra=data.readUInt16LE(cursor+30),comment=data.readUInt16LE(cursor+32),offset=data.readUInt32LE(cursor+42),mode=(data.readUInt32LE(cursor+38)>>>16)&0xf000;
  if(flags&~0x080e||![0,8].includes(method)||data.readUInt16LE(cursor+34)||![0,0x8000,0x4000].includes(mode))throw unsafe();
  if(compressed===0xffffffff||length===0xffffffff||offset===0xffffffff||cursor+46+nameLength+extra+comment>end)throw invalid();
  const nameBytes=data.subarray(cursor+46,cursor+46+nameLength),name=zipName(nameBytes,flags);cursor+=46+nameLength+extra+comment;
  if(names.has(name.toLowerCase()))throw unsafe();names.add(name.toLowerCase());
  total+=length;if(length>OFFICE_LIMITS.entryBytes||total>OFFICE_LIMITS.totalBytes)throw limit();
  if(offset+30>start||data.readUInt32LE(offset)!==0x04034b50||data.readUInt16LE(offset+6)!==flags||data.readUInt16LE(offset+8)!==method)throw invalid();
  const localName=data.readUInt16LE(offset+26),localExtra=data.readUInt16LE(offset+28),begin=offset+30+localName+localExtra,finish=begin+compressed;
  if(localName!==nameLength||!data.subarray(offset+30,offset+30+localName).equals(nameBytes)||finish>start)throw invalid();
  let rangeEnd=finish;
  if(flags&8){const sig=finish+4<=start&&data.readUInt32LE(finish)===0x08074b50?4:0;if(finish+sig+12>start||data.readUInt32LE(finish+sig)!==crc||data.readUInt32LE(finish+sig+4)!==compressed||data.readUInt32LE(finish+sig+8)!==length)throw invalid();rangeEnd+=sig+12;}
  else if(data.readUInt32LE(offset+14)!==crc||data.readUInt32LE(offset+18)!==compressed||data.readUInt32LE(offset+22)!==length)throw invalid();
  ranges.push([offset,rangeEnd]);
  let content;
  try{if(method===0){if(compressed!==length)throw invalid();content=data.subarray(begin,finish);}else{const decoded=inflateRawSync(data.subarray(begin,finish),{maxOutputLength:Math.max(1,Math.min(length,OFFICE_LIMITS.entryBytes)),info:true});if(decoded.engine.bytesWritten!==compressed)throw invalid();content=decoded.buffer;}}catch(error){if(error instanceof HttpError)throw error;throw invalid();}
  if(content.length!==length||zipCrc32(content)!==crc)throw invalid();
  if(name.endsWith('/')){if(length)throw invalid();}else entries.set(name,content);
 }
 if(cursor!==end)throw invalid();ranges.sort((a,b)=>a[0]-b[0]);let last=0;for(const [from,to] of ranges){if(from!==last)throw invalid();last=to;}if(last!==start)throw invalid();
 return entries;
}
function xmlText(bytes){if(!bytes||bytes.length>OFFICE_LIMITS.xmlBytes)throw limit();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw invalid();}if(/<!DOCTYPE|<!ENTITY/i.test(text)||text.includes('\0'))throw unsafe();return text;}
function unescape(value){try{return value.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|([a-z]+));/gi,(_,number,name)=>number?String.fromCodePoint(Number.parseInt(number.replace(/^x/i,''),/^x/i.test(number)?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[name]??''));}catch{throw invalid();}}
export function officeInspectionContent(name,data){const {entries}=validateOfficeArchive(name,data);return [...entries].flatMap(([entry,bytes])=>{const value=bytes.toString('utf8');return /\.(xml|rels)$/i.test(entry)?[value,unescape(value.replace(/<[^>]*>/g,''))]:[value];});}
function attributes(tag){const attrs={};for(const match of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){if(Object.hasOwn(attrs,match[1]))throw invalid();try{attrs[match[1]]=unescape(match[2]??match[3]);}catch{throw invalid();}}return attrs;}
export function validateOfficeArchive(name,data,{preview=false}={}){
 const type=officeType(name);if(!type)throw invalid();const entries=officeEntries(data),xml=new Map();
 for(const [entry,bytes] of entries){
  if(/(?:^|\/)(?:vbaProject[^/]*|activeX|customUI)(?:\/|\.|$)|\.(?:exe|dll|com|bat|cmd|ps1|vbs|js|py|jar)$/i.test(entry))throw unsafe();
  if(preview&&(/(?:^|\/)(?:embeddings|externalLinks|queryTables)(?:\/|$)|(?:^|\/)connections\.xml$|\.(?:svg|html?|mhtml?)$/i.test(entry)||bytes.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]))))throw new HttpError(400,'此 Office 文件含嵌入对象或外部内容，暂不能安全预览；仍可下载原文件。','office_unsafe_content');
  if(/\.(?:xml|rels)$/i.test(entry)){const content=xmlText(bytes);for(const tag of content.matchAll(/<(?:[\w.-]+:)?(?:Default|Override|Relationship)\b[^>]*\/?>/g)){const attrs=attributes(tag[0]);if(/macroEnabled|vbaProject|vbaData|activeX/i.test((attrs.ContentType??'')+' '+(attrs.Type??'')))throw unsafe();}xml.set(entry,content);}
 }
 const contentTypes=xml.get('[Content_Types].xml'),relationships=xml.get('_rels/.rels'),main=xml.get(type.part);if(!contentTypes||!relationships||!main)throw invalid();
 const overrides=[...contentTypes.matchAll(/<(?:[\w.-]+:)?Override\b[^>]*\/?>/g)].map(match=>attributes(match[0]));
 if(!overrides.some(item=>item.PartName==='/'+type.part&&item.ContentType===type.contentType)||!new RegExp('<(?:[\\w.-]+:)?'+type.root+'(?:\\s|>)').test(main))throw invalid();
 const rootLinks=[...relationships.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*\/?>/g)].map(match=>attributes(match[0]));
 if(!rootLinks.some(item=>/\/officeDocument$/.test(item.Type??'')&&item.Target?.replace(/^\//,'')===type.part&&item.TargetMode!=='External'))throw invalid();
 if(preview){
  for(const [entry,content] of xml){
   const links=[...content.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*\/?>/g)].map(match=>attributes(match[0]));
   const relationBase=entry==='_rels/.rels'?'':path.posix.dirname(entry.replace('/_rels/','/').replace(/\.rels$/,''));
   const unsafeLink=links.some(link=>{const target=link.Target??'',part=target.startsWith('/')?target.slice(1):path.posix.normalize(path.posix.join(relationBase,target));return !target||link.TargetMode==='External'||/[\\%:\x00-\x1f]/.test(target)||target.startsWith('//')||/\/(?:oleObject|package|attachedTemplate)$/i.test(link.Type??'')||part.startsWith('../')||!entries.has(part);});
   const plain=unescape(content.replace(/<[^>]*>/g,''));let externalAttribute=false;
   // Namespace identifiers such as smart-tag w:uri are declarations, not loads.
   // Check load-bearing attributes; relationships and external data parts are
   // rejected separately, including every external hyperlink relationship.
   for(const tag of content.matchAll(/<[^>]+>/g))for(const [key,value] of Object.entries(attributes(tag[0])))if(/(?:^|:)(?:src|href|base|url|odcFile|sourceFile|source|target|location)$/i.test(key)&&/^(?:(?:https?|file|ftp|smb|nfs|ldap|davs?):|\\\\)/i.test(value))externalAttribute=true;
   if(unsafeLink||externalAttribute||/(?:^|\/)externalLinks\//i.test(entry)||/<(?:[\w.-]+:)?(?:ddeLink|oleLink|attachedTemplate|altChunk|OLEObject)\b/i.test(content)||/\b(?:DDE|WEBSERVICE|RTD|IMPORTXML|IMPORTDATA)\s*\(/i.test(plain)||/\bINCLUDE(?:PICTURE|TEXT)\b/i.test(plain))throw new HttpError(400,'此 Office 文件含外部链接或动态内容，无法安全生成本机预览；仍可下载原文件。','office_unsafe_content');
  }
 }
 return {type,entries,xml};
}
