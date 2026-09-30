import { t } from './i18n';
import { useEffect, useState } from 'react';
import { api, apiUrl, write, messageOf } from './api';
const eventName='hither.artwork-changed';
async function storeArtwork(file:File) {
  if(!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type))throw new Error(t("请选择 PNG、JPEG、WebP 或 AVIF 图片。", "Choose a PNG, JPEG, WebP, or AVIF image."));
  if(file.size>8*1024*1024)throw new Error(t("图片需小于 8 MB，请选择稍小的文件。", "Choose an image no larger than 8 MB."));
  let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error(t("这张图片无法读取，请换一张图片。", "This image cannot be read. Choose another image."));}
  const tooLarge=bitmap.width*bitmap.height>32_000_000;bitmap.close();if(tooLarge)throw new Error(t("图片尺寸过大，请使用不超过 3200 万像素的图片。", "Choose an image with no more than 32 million pixels."));
  const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error(t("图片无法读取。", "The image could not be read.")));reader.readAsDataURL(file);});
  await write('/settings/artwork',{mime:file.type,base64},'PUT');window.dispatchEvent(new Event(eventName));
}
export function useArtwork() {
  const [url,setUrl]=useState('');const [ink,setInk]=useState('#35362e');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{let disposed=false;const read=async()=>{try{const info=await api<{revision?:string}|null>('/settings/artwork/info');if(!disposed){setUrl(info?.revision?apiUrl(`/settings/artwork?v=${encodeURIComponent(info.revision)}`):'');setError('');}}catch(error){if(!disposed)setError(messageOf(error));}};void read();window.addEventListener(eventName,read);return()=>{disposed=true;window.removeEventListener(eventName,read);};},[]);
  useEffect(()=>{if(!url)return;let disposed=false;const img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.drawImage(img,img.naturalWidth*.35,img.naturalHeight*.4,img.naturalWidth*.3,img.naturalHeight*.2,0,0,16,16);const pixels=ctx.getImageData(0,0,16,16).data;let brightness=0;for(let i=0;i<pixels.length;i+=4)brightness+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;if(!disposed)setInk(brightness/256>145?'#35362e':'#fff8ec');}catch{}};img.src=url;return()=>{disposed=true;};},[url]);
  return {url,ink,error,busy,save:async(file:File)=>{setBusy(true);setError('');try{await storeArtwork(file);return true;}catch(error){setError(messageOf(error));return false;}finally{setBusy(false);}}};
}
