import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, lstatSync, realpathSync, writeFileSync, openSync, closeSync, readFileSync, fstatSync, constants } from 'node:fs';
import { HttpError } from './store.mjs';

export const AVATAR_LIMIT=3*1024*1024;
const avatarStyles=new Set(['pixelArt','notionists','openPeeps','lorelei','micah','adventurer','avataaars','bottts','thumbs','shapes']);
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const mimeByExtension={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
function avatarDirectory(store){const directory=path.join(store.directory,'avatars');if(existsSync(directory)&&lstatSync(directory).isSymbolicLink())throw new HttpError(400,'头像目录不能是链接','invalid_avatar_directory');mkdirSync(directory,{recursive:true,mode:0o700});if(realpathSync(directory)!==directory)throw new HttpError(400,'头像目录不在本机资料目录中','invalid_avatar_directory');return directory;}
function imageMime(data){
  if(data.length>=24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.toString('latin1',12,16)==='IHDR')return 'image/png';
  if(data.length>=4&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
  if(data.length>=20&&data.toString('latin1',0,4)==='RIFF'&&data.toString('latin1',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(data.toString('latin1',12,16)))return 'image/webp';
  return null;
}

// Accept raster images only. Avatar URLs are generated here, never accepted from the client.
export function saveAgentAvatar(store,agentId,body){
  const agent=store.require('agents',agentId);
  if(!body||Object.keys(body).some(key=>key!=='dataUrl')||typeof body.dataUrl!=='string')throw new HttpError(400,'头像内容无效','invalid_avatar');
  return store.put('agents',{...agent,avatarImage:saveAvatarImage(store,body.dataUrl)});
}

export function saveAvatarImage(store,dataUrl){
  if(typeof dataUrl!=='string')throw new HttpError(400,'头像内容无效','invalid_avatar');
  if(dataUrl.length>Math.ceil(AVATAR_LIMIT/3)*4+40)throw new HttpError(413,'头像图片不能超过 3 MB','avatar_too_large');
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if(!match||!match[2]||match[2].length%4!==0)throw new HttpError(400,'请选择 PNG、JPEG 或 WebP 图片','invalid_avatar');
  const mime=match[1],data=Buffer.from(match[2],'base64');
  if(data.length>AVATAR_LIMIT)throw new HttpError(413,'头像图片不能超过 3 MB','avatar_too_large');
  if(data.toString('base64')!==match[2]||imageMime(data)!==mime)throw new HttpError(400,'头像格式与图片内容不一致','invalid_avatar');
  const file=`${randomUUID()}.${extensions[mime]}`;
  writeFileSync(path.join(avatarDirectory(store),file),data,{flag:'wx',mode:0o600});
  return `/api/avatars/${file}`;
}

export function getAvatar(store,file){
  if(typeof file!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/.test(file))throw new HttpError(404,'头像不存在','avatar_not_found');
  const fullPath=path.join(avatarDirectory(store),file);let descriptor;
  try{descriptor=openSync(fullPath,constants.O_RDONLY|constants.O_NOFOLLOW);const info=fstatSync(descriptor);if(!info.isFile()||info.size>AVATAR_LIMIT)throw new HttpError(404,'头像不存在','avatar_not_found');const data=readFileSync(descriptor),mime=mimeByExtension[path.extname(file).slice(1)];if(imageMime(data)!==mime)throw new HttpError(404,'头像文件无效','avatar_not_found');return {data,mime,bytes:data.length};}
  catch(error){if(error instanceof HttpError)throw error;throw new HttpError(404,'头像不存在','avatar_not_found');}
  finally{if(descriptor!==undefined)closeSync(descriptor);}
}

// Preserve an existing uniform generated style in spaces created before this setting.
export function defaultAgentAvatarStyle(store){
  const saved=store.get('meta','defaultAgentAvatarStyle')?.value;
  if(avatarStyles.has(saved))return saved;
  const existing=new Set(store.list('agents').filter(agent=>!agent.avatarImage).map(agent=>agent.avatarStyle||'pixelArt'));
  return existing.size===1&&avatarStyles.has([...existing][0])?[...existing][0]:'pixelArt';
}

export function batchAvatarStyle(store,body){
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(key=>!['avatarStyle','replaceUploaded'].includes(key))||!avatarStyles.has(body.avatarStyle))throw new HttpError(400,'头像风格无效','invalid_avatar_style');
  if(body.replaceUploaded!==undefined&&typeof body.replaceUploaded!=='boolean')throw new HttpError(400,'是否替换上传头像必须为布尔值','invalid_avatar_option');
  return store.transaction(()=>{
    let updated=0;
    const agents=store.list('agents').map(agent=>{
      const next={...agent,avatarStyle:body.avatarStyle};
      if(body.replaceUploaded)delete next.avatarImage;
      if(agent.avatarStyle!==next.avatarStyle||agent.avatarImage!==next.avatarImage){store.put('agents',next);updated++;}
      return next;
    });
    store.setMeta('defaultAgentAvatarStyle',body.avatarStyle);
    return {updated,agents};
  });
}
