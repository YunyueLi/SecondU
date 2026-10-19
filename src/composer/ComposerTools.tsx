import {ComposerToolNavigation,ComposerToolRow,useComposerToolView} from './ComposerToolNavigation';
import type {ReactNode} from 'react';
import {BottomSheet} from '../shared/BottomSheet';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Popover} from '@openai/apps-sdk-ui/components/Popover';
import {Switch} from '@openai/apps-sdk-ui/components/Switch';
import {Plus,Paperclip,User} from '@openai/apps-sdk-ui/components/Icon';
import {useId,useState} from 'react';
import {t} from '../i18n';

export function ComposerTools({onAttach,disabled,children,presentation='popover'}:{onAttach:()=>void;disabled?:boolean;children?:ReactNode;presentation?:'popover'|'sheet'}){
 const [open,setOpen]=useState(false),[view,setView]=useState<{id:string;title:string}>();
 const close=()=>{setOpen(false);setView(undefined);};

 if(presentation==='sheet')return <><Button type="button" color="secondary" variant="ghost" uniform className="composer-add-trigger" aria-label={t('添加附件与选择上下文','Attachments and context')} disabled={disabled} onClick={()=>setOpen(true)}><Plus/></Button>{open&&<BottomSheet title={view?.title||t('对话工具','Conversation tools')} onBack={view?()=>setView(undefined):undefined} onClose={close} className="composer-tools-sheet"><ComposerToolNavigation.Provider value={{view,open:setView,back:()=>setView(undefined),dismiss:close}}>{!view&&<ComposerToolRow icon={<Paperclip/>} label={t('添加照片和文件','Add photos and files')} onClick={()=>{close();onAttach();}}/>}<div className={view?'composer-tool-detail':'composer-tool-list'}>{children}</div></ComposerToolNavigation.Provider></BottomSheet>}</>;

 return <Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button type="button" color="secondary" variant="ghost" uniform className="composer-add-trigger" aria-label={t('添加附件','Add attachments')} disabled={disabled}><Plus/></Button></Popover.Trigger><Popover.Content side="top" align="start" width={235} minWidth="auto" className="composer-tools-popover"><Button type="button" color="secondary" variant="ghost" pill={false} className="composer-add-files" onClick={()=>{setOpen(false);onAttach();}}><Paperclip/>{t('添加照片和文件','Add photos and files')}</Button>{children&&<div className="composer-menu-tools">{children}</div>}</Popover.Content></Popover>;
}
export function DigitalTwinMode({enabled,onChange,note,onReview,onManage,disabled}:{enabled:boolean;onChange?:(value:boolean)=>void;note?:string;onReview?:()=>void;onManage?:()=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);const id=useId();
 const mobile=useComposerToolView(t('数字分身模式','Digital twin mode'));
 const content=<><div className="context-menu-main"><div className="context-menu-toggle"><label htmlFor={id}>{t('数字分身模式','Digital twin mode')}</label><Switch id={id} checked={enabled} disabled={!onChange} onCheckedChange={onChange}/></div><p>{note||t('结合对你的了解，提供更贴合你的建议。','Uses what SecondU knows about you to tailor its help.')}</p>{onReview&&<button type="button" className="context-menu-link" onClick={()=>{mobile?.dismiss();setOpen(false);onReview();}}>{t('查看本次依据','View used context')}</button>}</div><footer className="context-menu-footer">{onManage?<button type="button" className="context-menu-link" onClick={()=>{mobile?.dismiss();setOpen(false);onManage();}}>{t('管理数字分身','Manage digital twin')}</button>:<a className="context-menu-link" href="#self" onClick={()=>{mobile?.dismiss();setOpen(false);}}>{t('管理数字分身','Manage digital twin')}</a>}</footer></>;
 if(mobile)return mobile.hidden?null:mobile.active?content:<ComposerToolRow icon={<User/>} label={t('数字分身模式','Digital twin mode')} detail={enabled?t('开启','On'):t('关闭','Off')} disabled={disabled} onClick={mobile.show}/>;
 return <Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button type="button" color="secondary" variant="ghost" size="sm" className="composer-twin-trigger" disabled={disabled} aria-label={t(`数字分身模式：${enabled?'开启':'关闭'}`,`Digital twin mode: ${enabled?'on':'off'}`)}><User/><span className="composer-twin-label">{t('数字分身模式','Digital twin mode')}</span><i className={enabled?'is-on':''} aria-hidden="true"/></Button></Popover.Trigger><Popover.Content side="top" align="start" width={276} minWidth="auto" className="composer-tools-popover">{content}</Popover.Content></Popover>;
}
export function ComposerContextBar({children}:{children:ReactNode}){return <div className="composer-context-bar" aria-label={t('对话工具','Conversation tools')}>{children}</div>;}
