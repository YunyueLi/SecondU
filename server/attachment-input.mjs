import { HttpError } from './http-error.mjs';

export const ATTACHMENT_LIMIT=8*1024*1024;
export const ATTACHMENT_COUNT=6;
export const MULTIMODAL_REQUEST_LIMIT=72*1024*1024;
const invalid=message=>new HttpError(400,message,'invalid_attachment');

export function imageMime(data){
  if(data.length>=24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.toString('ascii',12,16)==='IHDR')return 'image/png';
  if(data.length>=4&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
  if(data.length>=20&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(data.toString('ascii',12,16)))return 'image/webp';
  if(data.length>=13&&['GIF87a','GIF89a'].includes(data.toString('ascii',0,6)))return 'image/gif';
  return undefined;
}
export function inlineImage(value){
  const match=typeof value==='string'&&/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if(!match||match[2].length%4!==0||match[2].length>Math.ceil(ATTACHMENT_LIMIT/3)*4)throw invalid('多模态图片必须是受支持格式的本地原件，不能使用远程链接、路径或文件标识。');
  const data=Buffer.from(match[2],'base64');
  if(data.length>ATTACHMENT_LIMIT||data.toString('base64')!==match[2]||imageMime(data)!==match[1])throw invalid('多模态图片内容与类型不一致。');
  return {mime:match[1],base64:match[2],size:data.length};
}
