import {useState} from 'react';
import type {Bootstrap,Connector,ConnectorKind} from '../../shared/contracts';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Switch} from '@openai/apps-sdk-ui/components/Switch';
import {Popover} from '@openai/apps-sdk-ui/components/Popover';
import {Document,Folder,Code,Plus} from '@openai/apps-sdk-ui/components/Icon';
import {t} from '../i18n';
import './connectors.css';
import {ConnectorServiceGlyph} from './ConnectorServiceIcon';

export function ConnectorIcon({kind}:{kind:ConnectorKind}) {const Icon=kind==='library'?Document:kind==='project'?Folder:Code;return <Icon/>;}
function statusLabel(connector:Connector){return ({ready:t('已连接','Connected'),untested:t('待测试','Not tested'),error:t('连接失败','Connection failed'),unavailable:t('暂不可用','Unavailable'),disabled:t('已停用','Disabled')})[connector.status];}

export function ConnectorPicker({data,value,onChange,disabled=false,onManage}:{data:Pick<Bootstrap,'connectors'>;onManage?:()=>void;value:string[];onChange?:(ids:string[])=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);
 const available=(data.connectors||[]).filter(item=>item.enabled||value.includes(item.id));
 return <Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button color="secondary" variant="ghost" size="sm" className={`composer-connectors-trigger ${value.length?'has-selection':''}`} aria-label={t(`连接器${value.length?`，已选择 ${value.length} 项`:''}`,`Connectors${value.length?`, ${value.length} selected`:''}`)} disabled={disabled}><ConnectorGlyph/><span>{t('连接器','Connectors')}</span>{value.length>0&&<span className="connector-count">{value.length}</span>}</Button></Popover.Trigger><Popover.Content className="connector-popover" side="top" align="start" width={310} minWidth="auto"><header><strong>{t('本次对话使用','Use in this conversation')}</strong></header>{available.length?<div className="connector-choice-list">{available.map(item=><label className="connector-choice" key={item.id}><ConnectorServiceGlyph connector={item}/><span><strong>{item.name}</strong><small>{item.status==='ready'?t(`${item.tools.length} 项可用工具`,`${item.tools.length} available tools`):statusLabel(item)}</small></span><Switch aria-label={t(`使用 ${item.name}`,`Use ${item.name}`)} checked={value.includes(item.id)} disabled={!onChange||(!value.includes(item.id)&&item.status!=='ready')} onCheckedChange={checked=>onChange?.(checked?[...value,item.id]:value.filter(id=>id!==item.id))}/></label>)}</div>:<p className="connector-empty-text">{t('连接资料或工具，让 SecondU 在对话中使用。','Connect your files or tools for SecondU to use in a conversation.')}</p>}<footer><Button color="secondary" variant="ghost" pill={false} onClick={()=>{setOpen(false);if(onManage)onManage();else location.hash='settings/connectors';}}><Plus/>{t('添加连接器','Add connectors')}</Button></footer></Popover.Content></Popover>;
}
export function ConnectorGlyph(){return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3v4m4-4v4M5 7h8v4a4 4 0 0 1-8 0V7Zm4 8v3a3 3 0 0 0 3 3h1m4-18v6m-2 0h4v6h-4zM17 15v6"/></svg>;}

export { ConnectorsSettings } from './ConnectorCatalogue';
