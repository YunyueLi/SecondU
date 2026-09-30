import { text } from './domain.mjs';
import { HttpError } from './store.mjs';
import { AVATAR_LIMIT, saveAvatarImage } from './avatars.mjs';
import { decodeBinaryArtifact } from './artifact-content.mjs';

export function saveProfile(store,body){
  const current=store.meta('profile');
  const englishName=Object.hasOwn(body,'englishName')?(body.englishName===null?'':text(body.englishName,'englishName',200,false)):current.englishName;
  let selfPersonId=current.selfPersonId;
  if(Object.hasOwn(body,'selfPersonId')){
    selfPersonId=body.selfPersonId===null?undefined:text(body.selfPersonId,'selfPersonId',200);
    if(selfPersonId)store.require('people',selfPersonId);
  }
  // Validate the complete profile before writing an image to the current space.
  const next={...current,
    name:text(body.name??current.name,'name',200),
    description:text(body.description??current.description,'description',3000,false),
    demo:body.demo===false?false:current.demo,
  };
  if(englishName)next.englishName=englishName;else delete next.englishName;
  if(selfPersonId)next.selfPersonId=selfPersonId;else delete next.selfPersonId;
  if(Object.hasOwn(body,'avatarImage'))throw new HttpError(400,'头像内容无效','invalid_avatar');
  if(body.clearAvatar!==undefined&&typeof body.clearAvatar!=='boolean')throw new HttpError(400,'头像内容无效','invalid_avatar');
  if(body.clearAvatar&&body.avatarDataUrl!==undefined)throw new HttpError(400,'头像内容无效','invalid_avatar');
  if(body.avatarDataUrl!==undefined){
    const value=body.avatarDataUrl;
    if(typeof value!=='string')throw new HttpError(400,'头像内容无效','invalid_avatar');
    if(value.length>Math.ceil(AVATAR_LIMIT/3)*4+40)throw new HttpError(413,'头像图片不能超过 3 MB','avatar_too_large');
    const mime=/^data:(image\/(?:png|jpeg|webp));base64,/.exec(value)?.[1];
    if(!mime)throw new HttpError(400,'请选择 PNG、JPEG 或 WebP 图片','invalid_avatar');
    const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
    if(Buffer.byteLength(value.slice(value.indexOf(',')+1),'base64')>AVATAR_LIMIT)throw new HttpError(413,'头像图片不能超过 3 MB','avatar_too_large');
    decodeBinaryArtifact({name:`avatar.${extension}`,content:value});
    next.avatarImage=saveAvatarImage(store,value);
  }else if(body.clearAvatar)delete next.avatarImage;
  return store.setMeta('profile',next);
}
