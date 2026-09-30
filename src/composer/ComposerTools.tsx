import type {ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Popover} from '@openai/apps-sdk-ui/components/Popover';
import {Switch} from '@openai/apps-sdk-ui/components/Switch';
import {Plus,Paperclip,User} from '@openai/apps-sdk-ui/components/Icon';
import {useId,useState} from 'react';
import {t} from '../i18n';

export function ComposerTools({onAttach,disabled,children}:{onAttach:()=>void;disabled?:boolean;children?:ReactNode}){
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button type="button" color="secondary" variant="ghost" uniform className="composer-add-trigger" aria-label={t('添加附件','Add attachments')} disabled={disabled}><Plus/></Button></Popover.Trigger><Popover.Content side="top" align="start" width={235} minWidth="auto" className="composer-tools-popover"><Button type="button" color="secondary" variant="ghost" pill={false} className="composer-add-files" onClick={()=>{setOpen(false);onAttach();}}><Paperclip/>{t('添加照片和文件','Add photos and files')}</Button>{children&&<div className="composer-menu-tools">{children}</div>}</Popover.Content></Popover>;
}
export function DigitalTwinMode({enabled,onChange,note,onReview,onManage,disabled}:{enabled:boolean;onChange?:(value:boolean)=>void;note?:string;onReview?:()=>void;onManage?:()=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);const id=useId();
 return <Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button type="button" color="secondary" variant="ghost" size="sm" className="composer-twin-trigger" disabled={disabled} aria-label={t(`数字分身模式：${enabled?'开启':'关闭'}`,`Digital twin mode: ${enabled?'on':'off'}`)}><User/><span>{t('数字分身模式','Digital twin mode')}</span><i className={enabled?'is-on':''} aria-hidden="true"/></Button></Popover.Trigger><Popover.Content side="top" align="start" width={276} minWidth="auto" className="composer-tools-popover"><div className="context-menu-main"><div className="context-menu-toggle"><label htmlFor={id}>{t('数字分身模式','Digital twin mode')}</label><Switch id={id} checked={enabled} disabled={!onChange} onCheckedChange={onChange}/></div><p>{note||t('结合对你的了解，提供更贴合你的建议。','Uses what SecondU knows about you to tailor its help.')}</p>{onReview&&<button type="button" className="context-menu-link" onClick={()=>{setOpen(false);onReview();}}>{t('查看本次依据','View used context')}</button>}</div><footer className="context-menu-footer">{onManage?<button type="button" className="context-menu-link" onClick={()=>{setOpen(false);onManage();}}>{t('管理数字分身','Manage digital twin')}</button>:<a className="context-menu-link" href="#self" onClick={()=>setOpen(false)}>{t('管理数字分身','Manage digital twin')}</a>}</footer></Popover.Content></Popover>;
}
export function ComposerContextBar({children}:{children:ReactNode}){return <div className="composer-context-bar" aria-label={t('对话工具','Conversation tools')}>{children}</div>;}
