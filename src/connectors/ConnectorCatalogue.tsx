import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {Bootstrap,Connector,ConnectorKind,ConnectorTestResult,SaveConnector} from '../../shared/contracts';
import type {ConnectorOAuthStart,ConnectorOAuthStatus} from '../../shared/connectors';
import {CONNECTOR_CATEGORIES,FINANCE_CONNECTOR_CATALOG,findCatalogService,resolveCatalogEndpoint,type CatalogService,type FinanceCatalogService} from '../../shared/connector-catalog.mjs';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Badge} from '@openai/apps-sdk-ui/components/Badge';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Switch} from '@openai/apps-sdk-ui/components/Switch';
import {Document,Folder,Code,Plus,Search,CheckCircle,Warning,SettingsCog,ChevronRight,ChevronDown,ExternalLink} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,ErrorNotice,Field} from '../components';
import {api,write,messageOf} from '../api';
import {t} from '../i18n';
import {oauthFormConfig} from './connectorOAuthForm';
import './connectors.css';
import './connector-directory.css';
import {connectorDirectorySections,type DirectoryService} from './connector-directory-model.mjs';
import {ServiceIcon} from './ConnectorServiceIcon';
import {FinanceServiceDetail,FinanceServiceIcon} from '../finance/FinanceConnections';
import {ConnectorDetail} from './ConnectorDetail';
import {financeRequest} from '../finance/api';

type AuthMode='none'|'bearer'|'oauth';
type OAuthConfig={clientId?:string;clientSecret?:string;hasClientSecret?:boolean;scopes?:string[];callbackPort?:number;issuerUrl?:string;resourceUrl?:string;authorized?:boolean;expiresAt?:string};
type Connection=Connector&{catalogId?:string;authMode?:AuthMode;oauth?:OAuthConfig};
type Editing=Connection|ConnectorKind|CatalogService;
type OAuthAttempt=ConnectorOAuthStart;
function LocalIcon({kind}:{kind:ConnectorKind}){const Icon=kind==='library'?Document:kind==='project'?Folder:Code;return <Icon/>;}
function statusLabel(connector:Connection){return ({ready:t('已连接','Connected'),untested:connector.authMode==='oauth'&&!connector.oauth?.authorized?t('待授权','Needs authorization'):t('待检查','Not checked'),error:t('连接失败','Connection failed'),unavailable:t('暂不可用','Unavailable'),disabled:t('已停用','Disabled')})[connector.status];}
function matchingConnections(data:Bootstrap,service:CatalogService){return (data.connectors||[]).filter(item=>findCatalogService(item)?.id===service.id) as Connection[];}
function initialService(value:Editing){return typeof value!=='string'&&'authMethods'in value?value:typeof value!=='string'?findCatalogService(value):undefined;}
function external(url:string){return {href:url,target:'_blank',rel:'noreferrer noopener'};}

type ConnectorStatusKind=Connector['status']|'attention';
function ConnectorStatusBadge({status,state}:{status:ReactNode;state:ConnectorStatusKind}){
 const color=state==='ready'?'success':state==='error'?'danger':state==='attention'?'warning':'secondary';
 return <Badge className="connector-status-badge" color={color} variant="soft" size="sm">{state==='ready'?<CheckCircle aria-hidden="true"/>:state==='error'||state==='attention'?<Warning aria-hidden="true"/>:null}{status}</Badge>;
}
function ConnectorServiceRow({icon,name,description,status,statusKind='untested',saved=false,live=false,label,actionLabel,onOpen}:{icon:ReactNode;name:string;description:string;status?:ReactNode;statusKind?:ConnectorStatusKind;saved?:boolean;live?:boolean;label:string;actionLabel?:string;onOpen:()=>void}){
 return <Button className={`connector-directory-row${actionLabel?' connector-directory-row--manage':''}`} color="secondary" variant="ghost" pill={false} onClick={onOpen} aria-label={label}>
  <span className="connector-directory-row-layout">{icon}<span className="connector-directory-row-copy"><span className="connector-directory-row-heading"><strong>{name}</strong>{status&&<span className="connector-directory-row-status" aria-live={live?'polite':undefined}><ConnectorStatusBadge status={status} state={statusKind}/></span>}</span><span className="connector-directory-row-description">{description}</span></span><span className="connector-directory-row-action" aria-hidden="true">{actionLabel?<>{actionLabel}<ChevronRight/></>:saved?<SettingsCog/>:<Plus/>}</span></span>
 </Button>;
}
function ConnectorConnectionRow({icon,name,description,status,statusKind,statusDetail,actions,error}:{icon:ReactNode;name:string;description:ReactNode;status:ReactNode;statusKind:ConnectorStatusKind;statusDetail?:ReactNode;actions:ReactNode;error?:string}){
 return <article className="connector-connected-row">{icon}<div className="connector-directory-row-copy"><div className="connector-directory-row-heading"><h3>{name}</h3><span className="connector-directory-row-status"><ConnectorStatusBadge status={status} state={statusKind}/></span>{statusDetail}</div><p className="connector-directory-row-description">{description}</p></div><div className="connector-connected-row-actions">{actions}</div>{error&&<p className="connector-connected-row-error">{error}</p>}</article>;
}

type FinanceMethod='oauth'|'appkey';
type FinanceDirectoryConnection={provider:string;method?:FinanceMethod;state:'connected'|'attention'|'disconnected'|'unknown'|'unavailable';linked:boolean;connected:boolean};
const financeMethods:FinanceMethod[]=['oauth','appkey'];
function financeDirectoryConnection(value:unknown,method:FinanceMethod):FinanceDirectoryConnection{
 if(!value||typeof value!=='object')throw new Error('Invalid finance connection status');
 const status=value as Record<string,unknown>;
 const knownStatuses=method==='appkey'?['disconnected','configured','connected']:['disconnected','awaiting_authorization','refresh_required','connected'];
 if(status.provider!=='moomoo'||status.readOnly!==true||typeof status.connected!=='boolean'||typeof status.status!=='string'||!knownStatuses.includes(status.status)||(method==='appkey'&&(status.method!=='appkey'||typeof status.configured!=='boolean')))throw new Error('Invalid finance connection status');
 if(status.available===false)return {provider:'moomoo',method,state:status.reason==='showcase'?'unavailable':'unknown',linked:false,connected:false};
 if(status.status==='connected'&&!status.connected||status.status==='disconnected'&&(status.connected||status.configured===true)||method==='appkey'&&status.connected&&!status.configured)throw new Error('Inconsistent finance connection status');
 const linked=status.connected||status.configured===true||status.status==='awaiting_authorization'||status.status==='refresh_required';
 const connected=status.connected&&status.status==='connected';
 const attention=status.status==='configured'||status.status==='awaiting_authorization'||status.status==='refresh_required'||status.syncStatus==='stale'||Boolean(status.lastSyncError)||Boolean(status.lastError);
 return {provider:'moomoo',method,state:attention?'attention':connected?'connected':'disconnected',linked,connected};
}
function financeServiceStatus(connections:FinanceDirectoryConnection[],loading:boolean){
 const linked=connections.some(item=>item.linked),connected=connections.some(item=>item.connected);
 const unknown=connections.some(item=>item.state==='unknown'),attention=connections.some(item=>item.state==='attention'),unavailable=connections.every(item=>item.state==='unavailable');
 const label=loading?t('正在检查连接','Checking connection'):unknown?t('状态待检查','Status unknown'):attention?t('连接需处理','Needs attention'):connected?t('已连接','Connected'):unavailable?t('示例空间不可用','Unavailable in example space'):t('未连接','Not connected');
 return {linked,unknown,loading,label,showRow:linked||unknown||loading,state:unknown?'unknown':attention?'attention':connected?'connected':unavailable?'unavailable':'disconnected'};
}

export function ConnectorsSettings({data,onRefresh}:{data:Bootstrap;onRefresh:()=>Promise<void>;presentation?:'desktop'|'mobile'}){
 const [search,setSearch]=useState(''),[category,setCategory]=useState('all'),[view,setView]=useState('discover');
 const [financeDetail,setFinanceDetail]=useState<FinanceCatalogService>();
 const [financeConnections,setFinanceConnections]=useState<FinanceDirectoryConnection[]>(()=>financeMethods.map(method=>({provider:'moomoo',method,state:'unknown',linked:false,connected:false}))),[financeLoading,setFinanceLoading]=useState(true);
 const [editing,setEditing]=useState<Editing>(),[detail,setDetail]=useState<CatalogService>(),[busy,setBusy]=useState<string>(),[error,setError]=useState('');
 useEffect(()=>{
  if(financeDetail)return;
  let active=true,controller:AbortController|undefined;
  const refresh=async()=>{
   controller?.abort();const request=new AbortController();controller=request;setFinanceLoading(true);
   const results=await Promise.allSettled([...financeMethods.map(async method=>financeDirectoryConnection(await financeRequest<unknown>(`/connections/moomoo/${method==='appkey'?'appkey/':''}status`,undefined,'GET',request.signal),method)),financeRequest<{providers:Array<{provider:string;available:boolean;connected:boolean;configured:boolean;status:string;lastSyncError?:unknown}>}>('/connections',undefined,'GET',request.signal)]);
   if(!active||request.signal.aborted)return;
   const native=results[2],values=native.status==='fulfilled'&&'providers'in native.value?native.value.providers:[];
   const next:FinanceDirectoryConnection[]=financeMethods.map((method,index)=>{const result=results[index];return result.status==='fulfilled'&&'provider'in result.value?result.value:{provider:'moomoo',method,state:'unknown',linked:false,connected:false};});
   for(const service of FINANCE_CONNECTOR_CATALOG.filter(item=>item.id!=='moomoo')){const status=values.find(item=>item.provider===service.id);next.push({provider:service.id,state:!status?'unknown':!status.available?'unavailable':status.configured&&(status.lastSyncError||status.status==='error')?'attention':status.connected?'connected':status.configured?'attention':'disconnected',linked:!!status?.configured,connected:!!status?.connected});}
   setFinanceConnections(next);setFinanceLoading(false);
  };
  const wake=()=>{if(!document.hidden)void refresh();};
  void refresh();window.addEventListener('focus',wake);window.addEventListener('finance:changed',wake);
  return()=>{active=false;controller?.abort();window.removeEventListener('focus',wake);window.removeEventListener('finance:changed',wake);};
 },[financeDetail]);
 const query=search.trim().toLowerCase();const all=(data.connectors||[]) as Connection[];
 const finance=financeServiceStatus(financeConnections,financeLoading),financeById=Object.fromEntries(FINANCE_CONNECTOR_CATALOG.map(service=>[service.id,financeServiceStatus(financeConnections.filter(row=>row.provider===service.id),financeLoading)])),knownConnectionCount=all.length+Object.values(financeById).filter(status=>status.linked).length;
 const financeStatusKind=(item:ReturnType<typeof financeServiceStatus>):ConnectorStatusKind=>item.loading?'untested':item.state==='connected'?'ready':item.state==='attention'?'attention':item.state==='unavailable'?'unavailable':'untested';
 const connectionCount=finance.loading||finance.unknown?knownConnectionCount?`${knownConnectionCount}+`:'—':String(knownConnectionCount);
 const countDescription=finance.loading?t('正在检查财务连接，连接总数尚未确认','Checking financial connections; total is not confirmed'):finance.unknown?t('部分财务状态待检查，数量仅包含已确认添加的连接','Some financial status is unknown; count includes confirmed saved connections only'):t(`${knownConnectionCount} 个已添加连接`,`${knownConnectionCount} saved connections`);
 const directorySections=connectorDirectorySections({category,query});
 const connections=all.filter(item=>{const service=findCatalogService(item);return (category==='all'||service?.category===category)&&`${item.name} ${service?.description||''} ${item.url||''}`.toLowerCase().includes(query);});
 async function toggle(item:Connection){setBusy(item.id);setError('');try{await write(`/connectors/${item.id}`,{enabled:!item.enabled},'PUT');await onRefresh();}catch(e){setError(messageOf(e));}finally{setBusy(undefined);}}
 async function test(item:Connection){setBusy(item.id);setError('');try{const result=await write<ConnectorTestResult>(`/connectors/${item.id}/test`,{});await onRefresh();if(!result.ok)setError(result.message);}catch(e){setError(messageOf(e));}finally{setBusy(undefined);}}
 const start=(value:Editing)=>{setDetail(undefined);setEditing(value);setError('');};
 const financeServices=FINANCE_CONNECTOR_CATALOG.filter(item=>(category==='all'||category===item.category)&&`${item.name} ${item.description} ${item.descriptionEn} finance 财务`.toLowerCase().includes(query));
 const savedFinanceServices=financeServices.filter(service=>financeById[service.id].showRow);
 const discoveryRow=(service:DirectoryService)=>{
  if(!('authMethods'in service)){
   const state=financeById[service.id],status=state.loading||state.state==='disconnected'?undefined:state.label;
   return <ConnectorServiceRow key={service.id} icon={<FinanceServiceIcon service={service}/>} name={service.name} description={t(service.description,service.descriptionEn)} status={status} statusKind={financeStatusKind(state)} saved={state.linked} live label={t(`查看 ${service.name} 连接方式`,`View ${service.name} connection`)} onOpen={()=>setFinanceDetail(service)}/>;
  }
  const bindings=matchingConnections(data,service),ready=bindings.find(item=>item.status==='ready'),saved=ready||bindings[0];
  const status=saved?statusLabel(saved):service.providerReview?t('需服务商准入','Provider approval'):service.preview?t('预览版','Preview'):service.localServer?t('本机服务','Local service'):undefined;
  return <ConnectorServiceRow key={service.id} icon={<ServiceIcon service={service}/>} name={service.name} description={t(service.description,service.descriptionEn)} status={status} statusKind={saved?.status} saved={!!saved} label={t(`查看 ${service.name} 连接方式`,`View ${service.name} connection`)} onOpen={()=>setDetail(service)}/>;
 };
 return <div className="connectors-settings"><header className="settings-panel-heading"><div className="settings-title-row"><h2 id="settings-connectors-title">{t('连接器','Connectors')}</h2><Button size="sm" color="secondary" variant="outline" onClick={()=>start('mcp_http')}><Plus/>{t('自定义','Custom')}</Button></div></header>
 <Input aria-label={t('搜索连接器','Search connectors')} placeholder={t('搜索服务与工具','Search services and tools')} startAdornment={<Search/>} value={search} onChange={e=>setSearch(e.target.value)}/>
 <div className="connector-directory-tabs" role="tablist" aria-label={t('连接器目录','Connector directory')}><button role="tab" aria-selected={view==='discover'} onClick={()=>setView('discover')}><span className="connector-tab-label">{t('发现服务','Discover')}</span></button><button role="tab" aria-selected={view==='connected'} onClick={()=>setView('connected')}><span className="connector-tab-label">{t('我的连接','My connections')}</span><span className="connector-tab-count" title={countDescription} aria-label={countDescription}>{connectionCount}</span></button></div>
 <div className="connector-directory-filters" aria-label={t('服务分类','Service categories')}>{CONNECTOR_CATEGORIES.map(item=><Button key={item.id} color="secondary" variant="ghost" size="sm" selected={category===item.id} onClick={()=>setCategory(item.id)}>{t(item.zh,item.en)}</Button>)}</div><ErrorNotice error={error}/>
 {view==='discover'?<div className="connector-discovery">
  {directorySections.map(section=><section className="connector-directory-section" key={section.id} aria-labelledby={`connector-section-${section.id}`}><h3 id={`connector-section-${section.id}`}>{t(section.zh,section.en)}</h3><div className="connector-directory-rows">{section.services.map(discoveryRow)}</div></section>)}
  {!directorySections.length&&<p className="connector-empty-state">{t('没有找到匹配的服务','No matching services')}</p>}
  {category==='all'&&!query&&<section className="connector-directory-section" aria-labelledby="connector-section-local"><h3 id="connector-section-local">{t('本机资源','Local resources')}</h3><div className="connector-directory-rows"><ConnectorServiceRow icon={<span className="connector-service-icon is-local"><Document/></span>} name={t('资料库','Library')} description={t('搜索当前空间的资料','Search this space’s sources')} label={t('连接当前空间资料库','Connect this space’s library')} onOpen={()=>start('library')}/><ConnectorServiceRow icon={<span className="connector-service-icon is-local"><Folder/></span>} name={t('本地项目','Local project')} description={t('阅读项目文件','Read project files')} label={t('连接本地项目','Connect a local project')} onOpen={()=>start('project')}/></div></section>}
 </div>:<div className="connector-catalog">
  {savedFinanceServices.map(service=><ConnectorServiceRow key={service.id} icon={<FinanceServiceIcon service={service}/>} name={service.name} description={t(service.description,service.descriptionEn)} status={financeById[service.id].label} statusKind={financeStatusKind(financeById[service.id])} live actionLabel={t('管理连接','Manage connection')} label={t(`管理 ${service.name} 连接`,`Manage ${service.name} connection`)} onOpen={()=>setFinanceDetail(service)}/>)}
  {connections.map(item=>{const service=findCatalogService(item);return <ConnectorConnectionRow key={item.id} icon={service?<ServiceIcon service={service}/>:<span className="connector-service-icon is-local"><LocalIcon kind={item.kind}/></span>} name={item.name} description={service?t(service.description,service.descriptionEn):item.kind==='library'?t('当前空间的资料库','This space’s library'):item.kind==='project'?data.projects.find(project=>project.id===item.projectId)?.name||t('项目不可用','Project unavailable'):item.url} status={statusLabel(item)} statusDetail={item.status==='ready'&&<span className="connector-tool-count">{t(`${item.tools.length} 项工具`,`${item.tools.length} tools`)}</span>} statusKind={item.status} actions={<><Button color="secondary" variant="ghost" size="sm" pill={false} aria-label={t(`配置 ${item.name}`,`Configure ${item.name}`)} onClick={()=>start(item)}>{t('配置','Configure')}</Button><Button color="secondary" variant="ghost" size="sm" pill={false} loading={busy===item.id} disabled={!!busy||!item.enabled} onClick={()=>item.authMode==='oauth'&&!item.oauth?.authorized?start(item):void test(item)}>{item.authMode==='oauth'&&!item.oauth?.authorized?t('授权账号','Authorize account'):t('检查连接','Check connection')}</Button><Switch aria-label={t(`启用 ${item.name}`,`Enable ${item.name}`)} checked={item.enabled} disabled={!!busy} onCheckedChange={()=>void toggle(item)}/></>} error={item.status==='error'?item.statusMessage:undefined}/>;})}
  {!connections.length&&!savedFinanceServices.length&&<div className="connector-my-empty"><Code/><h3>{query?t('没有匹配的连接','No matching connections'):t('连接你常用的服务','Connect the services you use')}</h3><p>{t('添加后，可在对话中选择使用。','Once connected, choose it in a conversation.')}</p><Button color="secondary" variant="outline" onClick={()=>{setView('discover');setCategory('all');setSearch('');}}>{t('浏览服务','Browse services')}</Button></div>}
 </div>}
 {financeDetail&&<FinanceServiceDetail service={financeDetail} onClose={()=>setFinanceDetail(undefined)}/>}
 {detail&&<ServiceDetail service={detail} connections={matchingConnections(data,detail)} onClose={()=>setDetail(undefined)} onConfigure={start}/>}
 {editing&&<ConnectorForm key={typeof editing==='string'?editing:'authMethods'in editing?`catalog-${editing.id}`:editing.id} value={editing} data={data} onRefresh={onRefresh} onClose={()=>setEditing(undefined)}/>}
 </div>;
}

function ServiceDetail({service,connections,onClose,onConfigure}:{service:CatalogService;connections:Connection[];onClose:()=>void;onConfigure:(value:Editing)=>void}){
 return <ConnectorDetail name={service.name} description={t(service.description,service.descriptionEn)} icon={<ServiceIcon service={service}/>} onClose={onClose}>
 <dl className="connector-detail-facts"><div><dt>{t('提供方','Provider')}</dt><dd>{t('官方服务','Official service')}</dd></div><div><dt>{t('连接方式','Connection')}</dt><dd>{service.authMethods.includes('oauth')?t('账号授权','Account authorization'):service.authMethods.includes('none')?t('直接连接','Direct connection'):t(service.tokenLabel||'访问令牌',service.tokenLabelEn||'Access token')}</dd></div>{service.preview&&<div><dt>{t('开放阶段','Availability')}</dt><dd>{t('开发者预览','Developer preview')}</dd></div>}</dl>
 {service.requirement&&<div className="connector-detail-requirement"><h4>{t('连接前准备','Before connecting')}</h4><p>{t(service.requirement,service.requirementEn||service.requirement)}</p>{service.setupUrl&&<a {...external(service.setupUrl)}>{t('打开服务商设置','Provider setup')}<ExternalLink/></a>}</div>}
 {connections.length>0&&<div className="connector-detail-existing"><h4>{t('已有连接','Your connections')}</h4>{connections.map(item=><button key={item.id} onClick={()=>onConfigure(item)}><span>{item.name}<small>{statusLabel(item)}</small></span><ChevronRight/></button>)}</div>}
 <div className="connector-detail-links"><a {...external(service.docsUrl)}>{t('官方说明','Official documentation')}<ExternalLink/></a></div>
 <div className="dialog-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t('关闭','Close')}</Button><Button color="primary" onClick={()=>onConfigure(service)}>{connections.length?t('添加另一个账号','Add another account'):service.providerReview||service.localServer||service.endpointTemplate?t('设置连接','Set up connection'):t('连接','Connect')}</Button></div></ConnectorDetail>;
}

function ConnectorForm({value,data,onRefresh,onClose}:{value:Editing;data:Bootstrap;onRefresh:()=>Promise<void>;onClose:()=>void}){
 const service=initialService(value),existing=typeof value!=='string'&&!('authMethods'in value)?value:undefined;
 const [saved,setSaved]=useState<Connection|undefined>(existing),[kind,setKind]=useState<ConnectorKind>(existing?.kind||(typeof value==='string'?value:'mcp_http'));
 const [name,setName]=useState(existing?.name||service?.name||''),[url,setUrl]=useState(existing?.url||service?.endpoint||''),[tenantId,setTenantId]=useState(''),[projectId,setProjectId]=useState(existing?.projectId||'');
 const [authMode,setAuthMode]=useState<AuthMode>(existing?.authMode||(existing?.hasToken?'bearer':service?.authMethods[0]||'none'));
 const [token,setToken]=useState(''),[clearToken,setClearToken]=useState(false),[allowLocalhost,setAllowLocalhost]=useState(existing?.allowLocalhost||!!service?.localServer);
 const [clientId,setClientId]=useState(existing?.oauth?.clientId||''),[clientSecret,setClientSecret]=useState(''),[scopes,setScopes]=useState((existing?.oauth?.scopes||service?.scopes||[]).join(' ')),[callbackPort,setCallbackPort]=useState(String(existing?.oauth?.callbackPort||58991));
 const [clearClientSecret,setClearClientSecret]=useState(false);
 const [issuerUrl,setIssuerUrl]=useState(existing?.oauth?.issuerUrl||''),[resourceUrl,setResourceUrl]=useState(existing?.oauth?.resourceUrl||'');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[attempt,setAttempt]=useState<OAuthAttempt>(),[attemptStatus,setAttemptStatus]=useState('pending');
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const finalUrl=service?.endpointTemplate&&!existing?resolveCatalogEndpoint(service,tenantId):url.trim();
 const tokenLabel=t(service?.tokenLabel||'访问令牌',service?.tokenLabelEn||'Access token');
 const authOptions=(service?.authMethods||['none','bearer','oauth']).map(mode=>({value:mode,label:mode==='oauth'?t('账号授权','Account authorization'):mode==='bearer'?tokenLabel:t('无需登录','No sign-in')}));
 const manual=service?.oauthRegistration==='manual';
 const refresh=async()=>{try{await onRefresh();}catch{if(mounted.current)setNotice(t('已保存，请刷新查看。','Saved. Refresh to view the update.'));}};
 useEffect(()=>{
   if(!attempt||attemptStatus!=='pending'||!saved)return;
   let cancelled=false,timer:ReturnType<typeof setTimeout>;
   const poll=async()=>{try{const result=await api<ConnectorOAuthStatus>(`/connectors/${saved.id}/oauth/status?attemptId=${encodeURIComponent(attempt.attemptId)}`);if(cancelled)return;if(result.status==='pending'){timer=setTimeout(poll,2000);return;}setAttemptStatus(result.status);if(result.connector)setSaved(result.connector);if(result.status==='connected'){setNotice(result.connector?.status==='ready'?t('已连接','Connected'):t('账号已授权','Account authorized'));if(result.connector?.status==='error')setError(result.connector.statusMessage);await refresh();}else setError(result.message||t('授权未完成，请重试。','Authorization did not finish. Try again.'));}catch(e){if(!cancelled){setError(messageOf(e));setAttemptStatus('error');}}};
   timer=setTimeout(poll,1200);return()=>{cancelled=true;clearTimeout(timer);};
 },[attempt,attemptStatus,saved?.id]);
 async function save(startAuthorization=false){setBusy(true);setError('');setNotice('');try{
   const body:SaveConnector={kind,name:name.trim()||(kind==='library'?t('我的资料库','My library'):kind==='project'?data.projects.find(item=>item.id===projectId)?.name||t('本地项目','Local project'):'MCP'),...(service?{catalogId:service.id}:{}),...(kind==='project'?{projectId}:{}),...(kind==='mcp_http'?{url:finalUrl,allowLocalhost,authMode,...(authMode==='bearer'?{...(token?{token}:{}),clearToken}:{}),...(authMode==='oauth'?{oauth:oauthFormConfig({clientId,clientSecret,clearClientSecret,scopes,callbackPort,issuerUrl,resourceUrl,defaultIssuer:service?.endpointTemplate&&tenantId?`https://login.microsoftonline.com/${tenantId}/v2.0`:undefined})}:{})}:{})};
   const connector=await write<Connection>(saved?`/connectors/${saved.id}`:'/connectors',body,saved?'PUT':'POST');setSaved(connector);setToken('');setClientSecret('');setClearClientSecret(false);await refresh();
   if(startAuthorization){const next=await write<OAuthAttempt>(`/connectors/${connector.id}/oauth/start`,{});setAttempt(next);setAttemptStatus('pending');}
   else if(kind==='mcp_http'&&authMode!=='oauth'){const result=await write<ConnectorTestResult>(`/connectors/${connector.id}/test`,{});setSaved(result.connector);await refresh();if(!result.ok){setError(result.message);return;}setNotice(t('已连接','Connected'));}
   else if(authMode!=='oauth')onClose();else setNotice(t('已保存','Saved'));
 }catch(e){setError(messageOf(e));}finally{setBusy(false);}}
 async function disconnect(){if(!saved)return;setBusy(true);setError('');try{setSaved(await write<Connection>(`/connectors/${saved.id}/oauth/disconnect`,{}));setAttempt(undefined);setNotice(t('已断开账号','Account disconnected'));await refresh();}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
 return <Dialog title={service?t(`连接 ${service.name}`,`Connect ${service.name}`):existing?t('连接设置','Connection settings'):t('添加连接器','Add connector')} className="connector-form-dialog" onClose={()=>{if(!busy)onClose();}}><form onSubmit={e=>{e.preventDefault();void save(authMode==='oauth');}}>
 {service&&<div className="connector-form-service"><ServiceIcon service={service}/><p>{t(service.description,service.descriptionEn)}</p></div>}
 {!existing&&!service&&<Field label={t('连接类型','Connection type')}><Select aria-label={t('连接类型','Connection type')} value={kind} onChange={option=>setKind(option.value as ConnectorKind)} options={[{value:'mcp_http',label:t('MCP 服务','MCP server')},{value:'library',label:t('本机资料库','Local library')},{value:'project',label:t('本地项目','Local project')}]}/></Field>}
 <Field label={t('名称','Name')}><Input aria-label={t('连接器名称','Connector name')} value={name} onChange={e=>setName(e.target.value)} placeholder={kind==='library'?t('我的资料库','My library'):t('连接名称','Connection name')} disabled={busy}/></Field>
 {kind==='project'&&<Field label={t('项目','Project')}><Select aria-label={t('连接的项目','Project to connect')} value={projectId} onChange={option=>setProjectId(option.value)} options={data.projects.filter(item=>!item.archived&&item.kind==='local').map(item=>({value:item.id,label:item.name}))} placeholder={t('选择本地项目','Choose a local project')}/>{!data.projects.some(item=>item.kind==='local'&&!item.archived)&&<a href="#projects" onClick={onClose}>{t('先添加本地项目','Add a local project first')}</a>}</Field>}
 {kind==='mcp_http'&&<>
 {service?.endpointTemplate&&!existing&&<Field label={t('Microsoft 租户 ID','Microsoft tenant ID')}><Input aria-label={t('Microsoft 租户 ID','Microsoft tenant ID')} value={tenantId} onChange={e=>setTenantId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" disabled={busy}/></Field>}
 {service?.localServer&&<p className="connector-form-help">{t('填写已启动的飞书本机服务地址。','Enter the address of your running local Lark service.')} <a {...external(service.docsUrl)}>{t('查看配置方式','Setup guide')}</a></p>}
 {(!service||service.localServer)&&<Field label={t('服务地址','Server URL')}><Input aria-label={t('MCP 服务地址','MCP server URL')} value={url} onChange={e=>setUrl(e.target.value)} placeholder={service?.localServer?'http://localhost:3000/mcp':'https://example.com/mcp'} disabled={busy}/></Field>}
 {authOptions.length>1&&<Field label={t('登录方式','Sign-in method')}><Select aria-label={t('连接器登录方式','Connector sign-in method')} value={authMode} onChange={option=>setAuthMode(option.value as AuthMode)} options={authOptions}/></Field>}
 {authMode==='bearer'&&<Field label={tokenLabel}><Input aria-label={tokenLabel} type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} placeholder={saved?.hasToken?t('已保存，留空保留','Saved; leave blank to keep'):service?.tokenLabelEn||'Bearer token'} disabled={busy}/>{saved?.hasToken&&<Switch label={t('清除已保存的令牌','Clear saved token')} checked={clearToken} onCheckedChange={setClearToken}/>}</Field>}
 {authMode==='oauth'&&<details className="connector-oauth-config" open={manual||undefined}><summary>{manual?t('应用授权设置','App authorization setup'):t('高级授权设置','Advanced authorization settings')}<ChevronDown/></summary><div>
 {manual&&service?.requirement&&<p className="connector-form-help">{t(service.requirement,service.requirementEn||service.requirement)}{service.setupUrl&&<> <a {...external(service.setupUrl)}>{t('服务商设置','Provider setup')}</a></>}</p>}
 <Field label="Client ID"><Input aria-label="OAuth Client ID" value={clientId} onChange={e=>setClientId(e.target.value)} disabled={busy} autoComplete="off" placeholder={manual?t('填写自己的应用 ID','Your app client ID'):t('留空时自动注册','Automatic registration when blank')}/></Field>
 <Field label="Client Secret"><Input aria-label="OAuth Client Secret" type="password" value={clientSecret} onChange={e=>{setClientSecret(e.target.value);if(e.target.value)setClearClientSecret(false);}} disabled={busy} autoComplete="off" placeholder={saved?.oauth?.hasClientSecret?t('已保存，留空保留','Saved; leave blank to keep'):t('应用要求时填写','If required by your app')}/>{saved?.oauth?.hasClientSecret&&<Switch label={t('清除已保存的应用密钥','Clear saved app secret')} checked={clearClientSecret} disabled={busy||!!clientSecret} onCheckedChange={setClearClientSecret}/>}</Field>
 <Field label={t('回调端口','Callback port')}><Input aria-label={t('OAuth 回调端口','OAuth callback port')} inputMode="numeric" value={callbackPort} onChange={e=>setCallbackPort(e.target.value)} disabled={busy}/><small className="connector-callback-url">http://127.0.0.1:{callbackPort||t('自动分配','auto')}/oauth/callback</small></Field>
 <Field label={t('授权范围','Scopes')}><Input aria-label={t('OAuth 授权范围','OAuth scopes')} value={scopes} onChange={e=>setScopes(e.target.value)} disabled={busy} placeholder={t('留空时使用服务提供的范围','Use the service’s scopes when blank')}/></Field>
 <details className="connector-oauth-endpoints"><summary>{t('手工发现设置','Manual discovery')}<ChevronDown/></summary><div><Field label={t('授权服务地址','Authorization issuer')}><Input aria-label="OAuth issuer URL" value={issuerUrl} onChange={e=>setIssuerUrl(e.target.value)} disabled={busy} placeholder={service?.endpointTemplate&&tenantId?`https://login.microsoftonline.com/${tenantId}/v2.0`:'https://provider.example.com'}/></Field><Field label={t('资源标识','Resource identifier')}><Input aria-label="OAuth resource URL" value={resourceUrl} onChange={e=>setResourceUrl(e.target.value)} disabled={busy} placeholder={finalUrl||t('通常留空','Usually left blank')}/></Field></div></details>
 </div></details>}
 {service?.endpoint&&!service.localServer&&<details className="connector-endpoint-detail"><summary>{t('服务地址','Server address')}<ChevronDown/></summary><code>{finalUrl}</code></details>}
 {!service&&<Switch label={t('本机服务','Local server')} checked={allowLocalhost} onCheckedChange={setAllowLocalhost}/>}
 </>}
 {attempt&&attemptStatus==='pending'&&<div className="connector-oauth-pending" role="status"><strong>{t('在浏览器中完成授权','Finish authorization in your browser')}</strong><a {...external(attempt.authorizationUrl)}>{t('打开授权页面','Open authorization page')}<ExternalLink/></a><span>{t('授权完成后，这里会自动更新。','This view updates when authorization finishes.')}</span></div>}
 {notice&&<p className="connector-form-notice" role="status">{notice}</p>}<ErrorNotice error={error}/>
 <div className="dialog-actions">{saved?.oauth?.authorized&&<Button color="secondary" variant="ghost" disabled={busy} onClick={()=>void disconnect()}>{t('断开账号','Disconnect account')}</Button>}<Button color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{notice===t('已连接','Connected')?t('完成','Done'):t('取消','Cancel')}</Button><Button type="submit" color="primary" loading={busy} disabled={busy||(kind==='mcp_http'&&!finalUrl)||(kind==='project'&&!projectId)||(kind==='mcp_http'&&authMode==='oauth'&&manual&&!clientId.trim())}>{kind==='mcp_http'&&authMode==='oauth'?saved?.oauth?.authorized?t('重新授权','Authorize again'):t('授权账号','Authorize account'):saved?t('保存并检查','Save and check'):t('连接','Connect')}</Button></div>
 </form></Dialog>;
}
