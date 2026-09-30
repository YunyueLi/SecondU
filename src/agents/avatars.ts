import { t } from '../i18n';
import { useEffect, useSyncExternalStore } from 'react';
import { createAvatar } from '@dicebear/core';
import * as pixelArt from '@dicebear/pixel-art';

export const avatarStyles=[
  {id:'pixelArt',label:'像素',labelEn:'Pixel art',author:'DiceBear',license:'CC0 1.0',source:'https://www.figma.com/community/file/1198754108850888330',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
  {id:'notionists',label:'手绘线条',labelEn:'Line art',author:'Zoish',license:'CC0 1.0',source:'https://heyzoish.gumroad.com/l/notionists',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
  {id:'openPeeps',label:'手绘人物',labelEn:'Open Peeps',author:'Pablo Stanley',license:'CC0 1.0',source:'https://www.openpeeps.com/',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
  {id:'lorelei',label:'细线插画',labelEn:'Lorelei',author:'Lisa Wischofsky',license:'CC0 1.0',source:'https://www.figma.com/community/file/1198749693280469639',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
  {id:'micah',label:'扁平插画',labelEn:'Micah',author:'Micah Lanier',license:'CC BY 4.0',source:'https://www.figma.com/community/file/829741575478342595',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
  {id:'adventurer',label:'冒险者',labelEn:'Adventurer',author:'Lisa Wischofsky',license:'CC BY 4.0',source:'https://www.figma.com/community/file/1184595184137881796',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
  {id:'avataaars',label:'经典卡通',labelEn:'Avataaars',author:'Pablo Stanley',license:'个人和商业使用许可',source:'https://avataaars.com/',licenseUrl:'https://avataaars.com/'},
  {id:'bottts',label:'机器人',labelEn:'Bottts',author:'Pablo Stanley',license:'个人和商业使用许可',source:'https://bottts.com/',licenseUrl:'https://bottts.com/'},
  {id:'thumbs',label:'抽象',labelEn:'Thumbs',author:'DiceBear',license:'CC0 1.0',source:'https://www.dicebear.com',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
  {id:'shapes',label:'几何',labelEn:'Shapes',author:'DiceBear',license:'CC0 1.0',source:'https://www.dicebear.com',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
] as const;
export type AvatarStyle=typeof avatarStyles[number]['id'];
type Style=Parameters<typeof createAvatar>[0];
const ready:Partial<Record<AvatarStyle,Style>>={pixelArt:pixelArt as Style};
const loaders:Partial<Record<AvatarStyle,()=>Promise<Style>>>={
  notionists:()=>import('@dicebear/notionists').then(style=>style as Style),openPeeps:()=>import('@dicebear/open-peeps').then(style=>style as Style),
  lorelei:()=>import('@dicebear/lorelei').then(style=>style as Style),micah:()=>import('@dicebear/micah').then(style=>style as Style),
  adventurer:()=>import('@dicebear/adventurer').then(style=>style as Style),avataaars:()=>import('@dicebear/avataaars').then(style=>style as Style),
  bottts:()=>import('@dicebear/bottts').then(style=>style as Style),thumbs:()=>import('@dicebear/thumbs').then(style=>style as Style),shapes:()=>import('@dicebear/shapes').then(style=>style as Style),
};
const loading=new Set<AvatarStyle>(),failed=new Set<AvatarStyle>(),listeners=new Set<()=>void>(),cache=new Map<string,string>();let version=0;
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function validAvatarStyle(value?:string):AvatarStyle{return avatarStyles.some(style=>style.id===value)?value as AvatarStyle:'pixelArt';}
function load(style:AvatarStyle){if(ready[style]||loading.has(style)||failed.has(style))return;const loader=loaders[style];if(!loader)return;loading.add(style);void loader().then(result=>{ready[style]=result;}).catch(()=>failed.add(style)).finally(()=>{loading.delete(style);version++;listeners.forEach(listener=>listener());});}
export function useAvatarSource(id:string,requestedStyle?:string){
  const style=validAvatarStyle(requestedStyle);useSyncExternalStore(subscribe,()=>version,()=>0);useEffect(()=>load(style),[style]);
  const actual=ready[style]?style:'pixelArt';const key=`${actual}:${id}`;let source=cache.get(key);
  if(!source){source=createAvatar(ready[actual]!,{seed:id,size:80,radius:0,backgroundColor:[]}).toDataUri();cache.set(key,source);}
  return {source,pixel:actual==='pixelArt',loading:!ready[style]&&!failed.has(style),failed:failed.has(style)};
}

export function avatarStyleLabel(style: typeof avatarStyles[number]): string { return t(style.label, style.labelEn); }
export function avatarStyleLicense(style: typeof avatarStyles[number]): string { return style.license === '个人和商业使用许可' ? t('个人和商业使用许可', 'Free personal and commercial use') : style.license; }
