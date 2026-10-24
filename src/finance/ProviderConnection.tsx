import {useEffect,useRef,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Checkbox} from '@openai/apps-sdk-ui/components/Checkbox';
import {Badge} from '@openai/apps-sdk-ui/components/Badge';
import {CheckCircle,ExternalLink,ArrowRotateCw,Eye,EyeOff} from '@openai/apps-sdk-ui/components/Icon';
import {ErrorNotice,Field} from '../components';
import {financeRequest} from './api';
import {money} from './model';
import type {FinanceState} from './types';
import './provider-connection.css';

type ProviderField={key:string;label:string;type:'password'|'text'|'select'|'file';required?:boolean;options?:Array<string|{value:string;label:string}>;placeholder?:string;description?:string};
export type ProviderDefinition={id:string;name:string;description?:string;regions:string[];capabilities:string[];docsUrl:string;setupUrl:string;fields:ProviderField[];requirement?:string};
export type ProviderStatus={provider:string;callbackUrl?:string;configured:boolean;authorized?:boolean;connected:boolean;available:boolean;status:string;values?:Record<string,string>;secretFields?:string[];lastVerifiedAt?:string|null;lastSyncedAt?:string|null;lastError?:{message:string};lastSyncError?:{message:string};definition:ProviderDefinition;pending?:Authorization|null};
type PreviewAccount={accountRef:string;existingAccountId?:string|null;name:string;kind:'asset'|'liability';currency:string;amount:string;asOf:string;institution?:string;accountSuffix?:string;positionCount:number;transactionCount:number};
type Preview={previewId:string;expiresAt:string;provider:string;environment:string;canSync:boolean;fetchedAt:string;accounts:PreviewAccount[];previousAccounts:Array<{id:string;name:string;kind:string;currency:string;amount:string}>;positionCount:number;transactionCount:number};
type Authorization={kind:'hosted_link'|'teller_connect'|'redirect';state:string;applicationId?:string;environment?:string;authorizationUrl?:string;products?:string[];expiresAt?:string};
type HostedWidget={open:()=>void;destroy?:()=>void};
declare global {interface Window {TellerConnect?:{setup:(options:Record<string,unknown>)=>HostedWidget}}}
const scriptLoads=new Map<string,Promise<void>>();
function hostedScript(src:string){
 if(!scriptLoads.has(src))scriptLoads.set(src,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.onload=()=>resolve();script.onerror=()=>{script.remove();scriptLoads.delete(src);reject(new Error('授权窗口未能加载，请重试。'));};document.head.append(script);}));
 return scriptLoads.get(src)!;
}
const fieldLabels:Record<string,string>={production:'正式环境',development:'开发环境（真实账户）',sandbox:'沙盒（测试数据）',transactions:'交易与余额',investments:'投资与持仓',liabilities:'负债与账单','transactions,investments,liabilities':'交易、投资与负债',GB:'英国'};
const labelOptions=(field:ProviderField)=>(field.options||[]).map(option=>typeof option==='string'?{value:option,label:fieldLabels[option]||option}:option);
const dateText=(value:string)=>new Date(value).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'});

export function ProviderConnection({provider,hidden,onBack,onToggleAmounts}:{provider:string;hidden:boolean;onBack:()=>void;onToggleAmounts:()=>void}){
 const [status,setStatus]=useState<ProviderStatus>(),[values,setValues]=useState<Record<string,string>>({}),[preview,setPreview]=useState<Preview>(),[selected,setSelected]=useState<string[]>([]),[mappings,setMappings]=useState<Record<string,string>>({});
 const [accountDecisions,setAccountDecisions]=useState<Record<string,string>>({});
 const [authorization,setAuthorization]=useState<Authorization>();
 const [accounts,setAccounts]=useState<FinanceState['accounts']>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const live=useRef(true),widget=useRef<HostedWidget|undefined>(undefined);
 const request=<T,>(action:string,body?:object)=>financeRequest<T>(`/connections/${provider}/${action}`,body);
 const applyStatus=(next:ProviderStatus)=>{if(!live.current)return;setStatus(next);setAuthorization(next.pending||undefined);setValues(Object.fromEntries(next.definition.fields.map(field=>[field.key,next.values?.[field.key]||labelOptions(field)[0]?.value||''])));};
 const changed=()=>window.dispatchEvent(new Event('finance:changed'));
 useEffect(()=>{live.current=true;const abort=new AbortController();void Promise.all([financeRequest<ProviderStatus>(`/connections/${provider}/status`,undefined,'GET',abort.signal),financeRequest<FinanceState>('/state',undefined,'GET',abort.signal)]).then(([next,state])=>{applyStatus(next);setAccounts([...state.accounts,...state.liabilities].filter(row=>row.provider===provider||row.provider==='manual'&&!(state.positions?.items||[]).some(position=>position.accountId===row.id)));}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>{live.current=false;abort.abort();widget.current?.destroy?.();};},[provider]);

 useEffect(()=>{
  if(!authorization||!['hosted_link','redirect'].includes(authorization.kind))return;let active=true,running=false;
  const check=async()=>{if(running||!active||document.hidden)return;if(authorization.expiresAt&&Date.parse(authorization.expiresAt)<Date.now()){setAuthorization(undefined);setError('本次授权已过期，请重新开始。');return;}running=true;try{const next=await request<ProviderStatus>('complete',{state:authorization.state});if(active){applyStatus(next);setNotice('账户授权完成，可以读取预览。');changed();}}catch(e){if(active&&(e as {code?:string}).code!=='finance_provider_authorization_pending'){setAuthorization(undefined);setError(e instanceof Error?e.message:'授权未完成。');}}finally{running=false;}};
  const timer=window.setInterval(()=>void check(),3000);window.addEventListener('focus',check);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',check);};
 },[authorization?.state,provider]);
 async function run(action:string,work:()=>Promise<void>){setBusy(action);setError('');setNotice('');try{await work();}catch(e){if(live.current)setError(e instanceof Error?e.message:'连接未完成，请重试。');}finally{if(live.current)setBusy('');}}
 async function save(){await run('configure',async()=>{const input=Object.fromEntries(Object.entries(values).filter(([,value])=>value!==''));applyStatus(await request<ProviderStatus>('configure',input));setPreview(undefined);setNotice('连接设置已保存。');changed();});}
 async function complete(authorization:Authorization,input:object){await run('complete',async()=>{applyStatus(await request<ProviderStatus>('complete',{state:authorization.state,...input}));setNotice('账户授权完成，可以读取预览。');changed();});}
 async function authorize(){await run('authorize',async()=>{
  const authorization=await request<Authorization>('start',{});
  if(authorization.kind==='redirect'){
   const url=new URL(authorization.authorizationUrl||'');if(url.protocol!=='https:'||!['app.truelayer.com','app.truelayer-sandbox.com'].includes(url.hostname)||url.username||url.password||url.port)throw new Error('授权地址无效，请重试。');
   setAuthorization(authorization);window.open(url.href,'_blank','noopener,noreferrer');return;
  }
  if(authorization.kind==='hosted_link'){
   const url=new URL(authorization.authorizationUrl||'');if(url.protocol!=='https:'||url.hostname!=='secure.plaid.com'||url.username||url.password||url.port)throw new Error('Plaid 授权地址无效。');
   setAuthorization(authorization);window.open(url.href,'_blank','noopener,noreferrer');return;
  }else if(authorization.kind==='teller_connect'){
   await hostedScript('https://cdn.teller.io/connect/connect.js');if(!live.current)return;
   if(!window.TellerConnect||!authorization.applicationId)throw new Error('Teller 授权窗口不可用。');
   widget.current=window.TellerConnect.setup({applicationId:authorization.applicationId,environment:authorization.environment,products:authorization.products||['balance','transactions'],onSuccess:(result:{accessToken:string;enrollment?:unknown})=>void complete(authorization,{accessToken:result.accessToken,enrollment:result.enrollment}),onExit:()=>{},onFailure:()=>setError('Teller 授权未完成，请重新连接。')});
  }else throw new Error('服务未返回支持的授权方式。');
  widget.current?.open();
 });}
 async function read(){await run('preview',async()=>{const next=await request<Preview>('preview',{});if(!live.current)return;setPreview(next);setSelected(next.accounts.map(row=>row.accountRef));setMappings({});setAccountDecisions({});const [nextStatus,state]=await Promise.all([request<ProviderStatus>('status'),financeRequest<FinanceState>('/state')]);applyStatus(nextStatus);setAccounts([...state.accounts,...state.liabilities].filter(row=>row.provider===provider||row.provider==='manual'&&!(state.positions?.items||[]).some(position=>position.accountId===row.id)));changed();});}
 async function sync(){if(!preview)return;await run('sync',async()=>{await request('sync',{previewId:preview.previewId,accountRefs:selected,accountDecisions:Object.fromEntries(Object.entries(accountDecisions).filter(([id])=>!selected.some(ref=>mappings[ref]===id))),mappings:Object.fromEntries(Object.entries(mappings).filter(([ref,id])=>selected.includes(ref)&&id))});setPreview(undefined);applyStatus(await request<ProviderStatus>('status'));setNotice('所选账户已同步，资产与交易记录已更新。');changed();});}
 async function disconnect(){await run('disconnect',async()=>{applyStatus(await request<ProviderStatus>('disconnect',{}));setPreview(undefined);setNotice('连接已断开，已同步的历史记录保留。');changed();});}
 if(!status)return <div className="provider-connection"><ErrorNotice error={error}/>{!error&&<p className="finance-muted">正在读取连接设置…</p>}</div>;
 const bank=['plaid','teller','truelayer'].includes(provider),definition=status.definition;
 const previousAccounts=preview?.previousAccounts.filter(row=>!selected.some(ref=>mappings[ref]===row.id))||[];
 const reviewed=previousAccounts.every(row=>accountDecisions[row.id]);
 const needsReview=status.configured&&!!status.lastSyncError;
 const configuration=<div className="provider-configuration-body">{status.callbackUrl&&<p className="connector-form-help">在服务商控制台登记此回调地址：<code className="provider-callback-url">{status.callbackUrl}</code></p>}
  <form onSubmit={e=>{e.preventDefault();void save();}} className="provider-fields">
     {definition.fields.map(field=><Field key={field.key} label={field.label} hint={field.type==='file'?[field.description,values[field.key]?'已选择文件':status.secretFields?.includes(field.key)?'已保存，留空保留':''].filter(Boolean).join(' '):field.description}>{field.type==='select'?<Select aria-label={field.label} value={values[field.key]||''} options={labelOptions(field)} onChange={option=>setValues(current=>({...current,[field.key]:option.value}))} disabled={!!busy}/>:field.type==='file'?<input className="provider-file-input" aria-label={field.label} type="file" accept=".pem,.crt,.key,.txt" disabled={!!busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>24000){setError('凭据文件过大，请选择对应的 PEM 文件。');return;}void file.text().then(value=>setValues(current=>({...current,[field.key]:value}))).catch(()=>setError('无法读取所选文件。'));}}/>:<Input aria-label={field.label} type={field.type==='password'?'password':'text'} autoComplete="off" required={field.required&&!status.secretFields?.includes(field.key)} value={values[field.key]||''} onChange={e=>setValues(current=>({...current,[field.key]:e.target.value}))} placeholder={status.secretFields?.includes(field.key)?'已保存，留空保留':field.placeholder} disabled={!!busy}/>}</Field>)}
     <div className="provider-actions">{!status.configured&&<Button color="secondary" variant="ghost" disabled={!!busy} onClick={onBack}>返回</Button>}<Button type="submit" color={status.configured?'secondary':'primary'} variant={status.configured?'outline':'solid'} loading={busy==='configure'} disabled={!!busy}>保存设置</Button></div>
    </form>
 </div>;
 return <div className="provider-connection">
  {status.configured&&<div className="provider-connection-status"><Badge color={status.lastError?'danger':needsReview?'warning':status.connected?'success':status.configured?'warning':'secondary'} variant="soft" size="sm">{status.connected&&!needsReview&&!status.lastError&&<CheckCircle/>}{status.lastError?'连接需处理':needsReview?'账户待核对':status.connected?'已连接':status.configured?'待验证':'未连接'}</Badge>{status.lastSyncedAt&&<span className="provider-last-synced">上次同步 {dateText(status.lastSyncedAt)}</span>}</div>}
  {!status.available?<p className="finance-muted">请进入个人空间连接账户。</p>:<>
   {status.configured?<details className="provider-configuration"><summary>连接设置</summary>{configuration}</details>:configuration}
   <ErrorNotice error={error||status.lastError?.message||''}/>{notice&&<p role="status" className="provider-notice">{notice}</p>}
   {authorization&&['hosted_link','redirect'].includes(authorization.kind)&&<div className="provider-pending" role="status"><p>请在 {definition.name} 页面完成账户授权，完成后这里会继续。</p><a href={authorization.authorizationUrl} target="_blank" rel="noreferrer noopener">打开授权页面<ExternalLink/></a><Button color="secondary" variant="ghost" size="sm" onClick={()=>setAuthorization(undefined)}>暂停检查</Button></div>}
   {status.configured&&<div className="provider-actions"><Button color="secondary" variant="ghost" disabled={!!busy} onClick={onBack}>返回</Button>{(status.connected||preview)&&<Button color="secondary" variant="ghost" onClick={onToggleAmounts}>{hidden?<EyeOff/>:<Eye/>}{hidden?'显示金额':'隐藏金额'}</Button>}<Button color="secondary" variant="ghost" disabled={!!busy} onClick={()=>void disconnect()}>断开连接</Button>{bank&&<Button color="secondary" variant="outline" loading={busy==='authorize'||busy==='complete'} disabled={!!busy} onClick={()=>void authorize()}>{status.authorized?'重新授权':'授权账户'}</Button>}<Button color="primary" loading={busy==='preview'} disabled={!!busy||(bank&&!status.authorized)} onClick={()=>void read()}><ArrowRotateCw/>读取账户</Button></div>}
   {preview&&<section className="provider-preview" aria-label="账户同步预览"><h4>选择同步账户</h4>{!preview.canSync&&<p className="finance-muted">当前为测试数据，仅提供预览。</p>}
    {preview.accounts.length===0?<p className="finance-muted">此连接没有返回可用账户。</p>:<p className="finance-muted">已有相同账户时，选择对应账户以避免重复计入。</p>}
    <div className="provider-preview-accounts">{preview.accounts.map(account=><article className="provider-preview-account" key={account.accountRef}><div className="provider-account-heading"><Checkbox checked={selected.includes(account.accountRef)} disabled={!!busy} onCheckedChange={checked=>setSelected(current=>checked?[...current,account.accountRef]:current.filter(ref=>ref!==account.accountRef))} label={account.name}/><strong>{hidden?'••••':money(account.amount)} {account.currency}</strong></div><p>{account.institution||''}{account.accountSuffix?` ${account.accountSuffix}`:''}<span>{dateText(account.asOf)}</span></p><Select aria-label={`${account.name} 对应账户`} disabled={!selected.includes(account.accountRef)||!!account.existingAccountId||!!busy} value={mappings[account.accountRef]||''} options={[{value:'',label:account.existingAccountId?'更新已有来源账户':'新增来源账户'},...accounts.filter(row=>row.kind===account.kind&&row.currency===account.currency&&(row.provider==='manual'||preview.previousAccounts.some(previous=>previous.id===row.id))).map(row=>({value:row.id,label:`对应：${row.name}`}))]} onChange={option=>setMappings(current=>({...current,[account.accountRef]:option.value}))}/>{(account.positionCount>0||account.transactionCount>0)&&<small>{[account.positionCount?`${account.positionCount} 项持仓`:'',account.transactionCount?`${account.transactionCount} 笔交易`:''].filter(Boolean).join('，')}</small>}</article>)}</div>
    {previousAccounts.length>0&&<div className="provider-preview-accounts"><h4>确认原有账户</h4><p className="finance-muted">以下账户未在本次授权中返回。如已重新授权同一账户，请在上方对应；其他账户请选择如何保留。</p>{previousAccounts.map(account=><article className="provider-preview-account" key={account.id}><div className="provider-account-heading"><span>{account.name}</span><strong>{hidden?'••••':money(account.amount)} {account.currency}</strong></div><Select aria-label={`${account.name} 历史金额处理`} value={accountDecisions[account.id]||''} options={[{value:'',label:'选择处理方式'},{value:'retain',label:'保留历史金额，继续计入资产'},{value:'archive',label:'归档账户，停止计入资产'}]} disabled={!!busy} onChange={option=>setAccountDecisions(current=>({...current,[account.id]:option.value}))}/></article>)}</div>}
    <div className="provider-actions"><Button color="secondary" variant="ghost" disabled={!!busy} onClick={()=>setPreview(undefined)}>取消</Button><Button color="primary" disabled={!!busy||(!selected.length&&!previousAccounts.length)||!reviewed||!preview.canSync} loading={busy==='sync'} onClick={()=>void sync()}>同步所选账户</Button></div>
   </section>}
  </>}
 </div>;
}
