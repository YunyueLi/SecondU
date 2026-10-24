import {useEffect,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ExternalLink,ChevronRight} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,ErrorNotice} from '../components';
import {ConnectorDetail} from '../connectors/ConnectorDetail';
import {t} from '../i18n';
import {ServiceIcon} from '../connectors/ConnectorServiceIcon';
import {MoomooConnection} from './Connections';
import {ProviderConnection,type ProviderDefinition,type ProviderStatus} from './ProviderConnection';
import {financeRequest,useHiddenAmounts} from './api';
import type {FinanceCatalogService} from '../../shared/connector-catalog.mjs';

export function FinanceServiceIcon({service}:{service:FinanceCatalogService}){
 return <ServiceIcon service={service}/>;
}
const regionLabels:Record<string,string>={US:'美国',CA:'加拿大',GB:'英国',EU:'欧洲'};
const connectionMethods:Record<string,string>={plaid:'账户授权',teller:'账户授权',truelayer:'账户授权',ibkr_flex:'Flex 报表',snaptrade:'个人 API 密钥',moomoo:'AppKey / 账号授权'};
const connectionPreparation:Record<string,string>={
 plaid:'先在 Plaid 创建自己的应用，准备 Client ID 和 Secret，并开通需要的国家与数据产品。保存应用设置后，通过 Plaid Link 授权银行账户；具体覆盖以服务商和银行为准。',
 teller:'准备自己的 Teller Application ID。读取真实账户还需要该应用的客户端证书与私钥文件；保存设置后，通过 Teller Connect 授权美国银行账户。',
 truelayer:'准备已开通 Data API v3 的 TrueLayer 应用、Client ID 和 Client Secret，并在控制台登记下一步显示的回调地址。授权时需提供本人完整姓名和邮箱，当前支持英国银行。',
};
const moomooDefinition:ProviderDefinition={id:'moomoo',name:'Moomoo',regions:['以 Moomoo 账户及 OpenAPI 可用范围为准'],capabilities:['accounts','balances','positions'],docsUrl:'https://open.moomoo.com/api/overview/getting-started',setupUrl:'https://open.moomoo.com/dashboard',description:'使用 AppKey 时，先在 Moomoo 用户中心创建 AppKey 并上传公钥，再准备对应的 AppKey ID 和本机私钥文件。也可在连接设置中选择网页登录授权。',fields:[]};
type ServiceStatus={definition:ProviderDefinition;configured:boolean;connected:boolean;available:boolean;label:string};
function providerLabel(status:ProviderStatus){return status.lastError?'连接需处理':status.lastSyncError?'账户待核对':status.connected?'已连接':status.authorized?'已授权，待读取':status.configured?'已配置，待验证':'未连接';}

export function FinanceServiceDetail({service,onClose}:{service:FinanceCatalogService;onClose:()=>void}){
 const [hidden,setHidden]=useHiddenAmounts();
 const [configuring,setConfiguring]=useState(false),[status,setStatus]=useState<ServiceStatus>(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(configuring)return;
  const controller=new AbortController();setError('');setStatus(undefined);
  const read=async()=>{
   if(service.id!=='moomoo'){
    const next=await financeRequest<ProviderStatus>(`/connections/${service.id}/status`,undefined,'GET',controller.signal);
    return {definition:next.definition,configured:next.configured,connected:next.connected,available:next.available,label:providerLabel(next)};
   }
   type MoomooStatus={configured?:boolean;connected:boolean;available?:boolean;lastError?:unknown;lastSyncError?:unknown;status:string};
   const [appkey,oauth]=await Promise.all(['appkey/status','status'].map(route=>financeRequest<MoomooStatus>(`/connections/moomoo/${route}`,undefined,'GET',controller.signal)));
   const connected=appkey.connected||oauth.connected,configured=Boolean(appkey.configured||oauth.connected||oauth.status==='awaiting_authorization'||oauth.status==='refresh_required');
   return {definition:moomooDefinition,configured,connected,available:appkey.available!==false||oauth.available!==false,label:appkey.lastError||oauth.lastError||appkey.lastSyncError||oauth.lastSyncError?'连接需处理':connected?'已连接':configured?'已配置，待验证':'未连接'};
  };
  void read().then(next=>{if(!controller.signal.aborted)setStatus(next);}).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'连接状态暂时无法读取。');});
  return()=>controller.abort();
 },[service.id,configuring,attempt]);
 const description=t(service.description,service.descriptionEn),definition=status?.definition;
 const regionRestriction=definition?.regions.filter(region=>!regionLabels[region]).join('；');
 const regionSummary=regionRestriction?'依账户及机构':definition?.regions.map(region=>regionLabels[region]||region).join('、');
 if(configuring)return <Dialog title={t(`连接 ${service.name}`,`Connect ${service.name}`)} className="connector-form-dialog finance-connection-form" onClose={onClose}><div className="finance-connection-form-body">
  <div className="connector-form-service"><FinanceServiceIcon service={service}/><p>{description}</p></div>
  {service.id==='moomoo'?<MoomooConnection hidden={hidden} onBack={()=>setConfiguring(false)} onToggleAmounts={()=>setHidden(!hidden)}/>:<ProviderConnection provider={service.id} hidden={hidden} onBack={()=>setConfiguring(false)} onToggleAmounts={()=>setHidden(!hidden)}/>}
 </div></Dialog>;
 return <ConnectorDetail name={service.name} description={description} icon={<FinanceServiceIcon service={service}/>} onClose={onClose}>
  {definition?<><dl className="connector-detail-facts"><div><dt>提供方</dt><dd>{definition.name}</dd></div><div><dt>连接方式</dt><dd>{connectionMethods[service.id]}</dd></div><div><dt>覆盖地区</dt><dd>{regionSummary}</dd></div></dl>
   <div className="connector-detail-requirement"><h4>连接前准备</h4><p>{definition.requirement||connectionPreparation[service.id]||definition.description}</p>{regionRestriction&&<p>{regionRestriction}。</p>}<a href={definition.setupUrl} target="_blank" rel="noreferrer noopener">打开服务商设置<ExternalLink/></a></div>
   {(status.configured||status.connected)&&<div className="connector-detail-existing"><h4>已有连接</h4><button onClick={()=>setConfiguring(true)}><span>{service.name}<small>{status.label}</small></span><ChevronRight/></button></div>}
   {!status.available&&<p className="connector-form-help">请进入个人空间连接自己的账户。</p>}
   <div className="connector-detail-links"><a href={definition.docsUrl} target="_blank" rel="noreferrer noopener">官方说明<ExternalLink/></a></div>
  </>:error?<><ErrorNotice error={error}/><Button color="secondary" variant="outline" onClick={()=>setAttempt(value=>value+1)}>重新读取</Button></>:<p className="connector-form-help" role="status">正在读取连接信息…</p>}
  <div className="dialog-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t('关闭','Close')}</Button><Button color="primary" disabled={!status||!status.available} onClick={()=>setConfiguring(true)}>{status?.configured||status?.connected?t('管理连接','Manage connection'):t('连接','Connect')}</Button></div>
 </ConnectorDetail>;
}
