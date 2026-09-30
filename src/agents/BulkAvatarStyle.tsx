import { useState } from 'react';
import type { AgentProfile, AvatarStyle } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Check, User } from '@openai/apps-sdk-ui/components/Icon';
import { ErrorNotice } from '../components';
import { write, messageOf } from '../api';
import { t } from '../i18n';
import { AgentAvatar } from './AgentIdentity';
import { avatarStyles, avatarStyleLabel, avatarStyleLicense } from './avatars';
import './experts.css';

export function BulkAvatarStyle({agents,defaultStyle,onRefresh,compact=false}:{agents:AgentProfile[];defaultStyle?:AgentProfile['avatarStyle'];onRefresh:()=>Promise<void>;compact?:boolean}){
  const [open,setOpen]=useState(false),[style,setStyle]=useState<AvatarStyle>('pixelArt');const [replaceUploaded,setReplaceUploaded]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const uploaded=agents.filter(agent=>agent.avatarImage).length,attribution=avatarStyles.find(item=>item.id===style)!;
  async function save(){if(busy)return;setBusy(true);setError('');setNotice('');try{const result=await write<{updated:number;agents:AgentProfile[]}>('/agents/avatar-style',{avatarStyle:style,replaceUploaded},'PUT');await onRefresh();setNotice(t(`已更新 ${result.updated} 位助理的头像风格。`,`Updated the avatar style for ${result.updated} agents.`));}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
  return <Popover open={open} onOpenChange={value=>{if(busy)return;setOpen(value);if(value){setStyle(defaultStyle||agents.find(agent=>!agent.avatarImage)?.avatarStyle||'pixelArt');setReplaceUploaded(false);setError('');setNotice('');}}}><Popover.Trigger><Button color="secondary" variant="ghost" size="sm" uniform={compact} aria-label={t('头像风格','Avatar style')} title={t('头像风格','Avatar style')}><User/>{!compact&&t('头像风格','Avatar style')}</Button></Popover.Trigger><Popover.Content align="end" side="bottom" width={360} minWidth="auto"><div className="expert-bulk-style"><header><strong>{t('全部助理的头像','Avatars for all agents')}</strong><span>{t(`${agents.length} 位`,`${agents.length} agents`)}</span></header><p className="expert-bulk-hint">{t('新建、添加专家和扫码创建的助理也会沿用此风格。','New agents, experts and QR imports will use this style too.')}</p><div className="expert-bulk-grid" aria-label={t('选择统一头像风格','Choose an avatar style')}>{avatarStyles.map(item=><Button key={item.id} color="secondary" variant="ghost" pill={false} selected={style===item.id} disabled={busy} aria-label={avatarStyleLabel(item)} aria-pressed={style===item.id} onClick={()=>{setStyle(item.id);setNotice('');}}><AgentAvatar agent={{id:agents[0]?.id||'style-preview',name:'',avatarStyle:item.id}} size={34}/><span>{avatarStyleLabel(item)}</span>{style===item.id&&<Check/>}</Button>)}</div>
    {!!uploaded&&<Checkbox checked={replaceUploaded} onCheckedChange={value=>{setReplaceUploaded(value);setNotice('');}} disabled={busy} label={t(`同时替换 ${uploaded} 张上传头像`,`Also replace ${uploaded} uploaded avatars`)}/>}
    <p>{uploaded&&!replaceUploaded?t('已上传的图片会保留，其余助理使用所选风格。','Uploaded images stay as they are; other agents use the selected style.'):t('每位助理会得到所选风格下各自不同的头像。','Each agent gets its own distinct avatar in the selected style.')}</p>
    <p className="expert-bulk-credit"><a href={attribution.source} target="_blank" rel="noreferrer">{attribution.author}</a>{' / '}<a href={attribution.licenseUrl} target="_blank" rel="noreferrer">{avatarStyleLicense(attribution)}</a></p><ErrorNotice error={error}/><footer><span role="status">{notice}</span><Button color="primary" size="sm" loading={busy} onClick={()=>void save()}>{t('应用到全部','Apply to all')}</Button></footer>
  </div></Popover.Content></Popover>;
}
