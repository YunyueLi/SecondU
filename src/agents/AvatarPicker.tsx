import { apiUrl } from '../api';
import { t } from '../i18n';
import { useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Check, FileUpload } from '@openai/apps-sdk-ui/components/Icon';
import { AgentAvatar } from './AgentIdentity';
import { avatarStyles, avatarStyleLabel, avatarStyleLicense, type AvatarStyle } from './avatars';
import { messageOf } from '../api';

export function AvatarPicker({id,name,value,image,onStyle,onImage,onClear,disabled=false}:{id:string;name:string;value:AvatarStyle;image?:string;onStyle:(style:AvatarStyle)=>void;onImage:(dataUrl:string)=>void;onClear:()=>void;disabled?:boolean}) {
  const input=useRef<HTMLInputElement>(null);const sequence=useRef(0);const [reading,setReading]=useState(false);const [error,setError]=useState('');
  const attribution=avatarStyles.find(style=>style.id===value)!;
  async function read(file?:File){if(!file)return;const token=++sequence.current;setReading(true);setError('');try{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024)throw new Error(t("请选择 3 MB 以内的 PNG、JPEG 或 WebP 图片。", "Choose a PNG, JPEG, or WebP image under 3 MB."));
    const bitmap=await createImageBitmap(file);if(!bitmap.width||!bitmap.height){bitmap.close();throw new Error(t("图片内容无效。", "Invalid image contents."));}bitmap.close();
    const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error(t("无法读取图片。", "Could not read the image.")));reader.onerror=()=>reject(new Error(t("无法读取图片。", "Could not read the image.")));reader.readAsDataURL(file);});
    if(token===sequence.current)onImage(dataUrl);
  }catch(err){if(token===sequence.current)setError(messageOf(err));}finally{if(token===sequence.current)setReading(false);if(input.current)input.current.value='';}}
  return <section className="ag-avatar-picker"><div className="ag-avatar-picker-heading"><span>{t("头像", "Avatar")}</span><div><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>void read(event.target.files?.[0])}/><Button color="secondary" variant="outline" size="sm" disabled={disabled||reading} loading={reading} onClick={()=>input.current?.click()}><FileUpload/>{t("上传图片", "Upload image")}</Button>{image&&<Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={()=>{sequence.current++;setReading(false);onClear();}}>{t("使用生成头像", "Use generated avatar")}</Button>}</div></div>
    {image&&<div className="ag-uploaded-avatar"><img src={image.startsWith('/api/')?apiUrl(image):image} alt={t("助理头像", "Agent avatar")}/><p>{t("使用你的图片", "Your image")}<small>{t("保存在本机，保存角色后生效。", "Stored on this computer. Applied when you save the agent.")}</small></p></div>}
    <div className="ag-avatar-styles" aria-label={t("头像风格", "Avatar style")}>{avatarStyles.map(style=><Button key={style.id} color="secondary" variant="ghost" pill={false} className="ag-avatar-style" selected={!image&&value===style.id} disabled={disabled} onClick={()=>{sequence.current++;setReading(false);setError('');onStyle(style.id);}} aria-label={t(`${avatarStyleLabel(style)}头像${!image&&value===style.id?'，已选择':''}`, `${avatarStyleLabel(style)} avatar${!image&&value===style.id?', selected':''}`)}><AgentAvatar agent={{id,name,avatarStyle:style.id}} size={38}/><span>{avatarStyleLabel(style)}</span>{!image&&value===style.id&&<Check/>}</Button>)}</div>
    {!image&&<p className="ag-avatar-attribution">{t("头像作品：", "Avatar artwork: ")}<a href={attribution.source} target="_blank" rel="noreferrer">{attribution.author}</a>{t('，', ', ')}<a href={attribution.licenseUrl} target="_blank" rel="noreferrer">{avatarStyleLicense(attribution)}</a>{t("。以角色标识生成。", ". Generated from the agent’s identifier.")}</p>}
    {error&&<p className="ag-avatar-error" role="alert">{error}</p>}
  </section>;
}
