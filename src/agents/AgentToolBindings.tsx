import {useEffect,useState} from 'react';
import type {AgentProfile,Bootstrap} from '../../shared/contracts';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {CapabilityFields,emptyCapabilities} from './CapabilityFields';
import {ErrorNotice} from '../components';
import {write,messageOf} from '../api';
import {t} from '../i18n';

export function AgentToolBindings({agent,data,onRefresh,onDirtyChange,onBusyChange}:{agent:AgentProfile;data:Bootstrap;onRefresh:()=>Promise<void>;onDirtyChange:(value:boolean)=>void;onBusyChange:(value:boolean)=>void}){
 const original=agent.capabilities??emptyCapabilities();
 const [value,setValue]=useState(original),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const baseline=JSON.stringify({connectorIds:original.connectorIds,sourceIds:original.sourceIds});
 const dirty=JSON.stringify({connectorIds:value.connectorIds,sourceIds:value.sourceIds})!==baseline;
 useEffect(()=>{setValue(current=>({...current,connectorIds:original.connectorIds,sourceIds:original.sourceIds}));},[baseline]);
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>{onBusyChange(busy);},[busy,onBusyChange]);
 useEffect(()=>()=>{onDirtyChange(false);onBusyChange(false);},[onDirtyChange,onBusyChange]);
 async function save(){if(busy||!dirty)return;setBusy(true);setError('');setNotice('');try{await write(`/agents/${agent.id}`,{capabilities:{connectorIds:value.connectorIds,sourceIds:value.sourceIds}},'PUT');await onRefresh();setNotice(t('已保存，下一轮对话生效。','Saved. Applies on the next turn.'));}catch(err){setError(messageOf(err));}finally{setBusy(false);}}
 return <section className="agent-tool-bindings"><h3>{t('工具与资料','Tools and sources')}</h3><p className="ag-muted">{t('选择这位 Agent 可以使用的连接器和资料。账号授权仍在原服务中完成。','Choose the connectors and sources this agent can use. Account authorization stays with the service.')}</p><CapabilityFields sections="resources" value={value} onChange={next=>{setValue(next);setNotice('');}} data={data} disabled={busy}/><ErrorNotice error={error}/>{notice&&<p role="status" className="ag-muted">{notice}</p>}{dirty&&<div className="ag-form-actions"><Button color="secondary" variant="ghost" disabled={busy} onClick={()=>{setValue(original);setError('');}}>{t('取消修改','Discard')}</Button><Button color="primary" loading={busy} onClick={()=>void save()}>{t('保存','Save')}</Button></div>}</section>;
}
