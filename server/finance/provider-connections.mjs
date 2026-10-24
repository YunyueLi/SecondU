import path from 'node:path';
import {HttpError} from '../http-error.mjs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {createFinanceVault} from './connection-vault.mjs';
import {BANK_PROVIDER_DEFINITIONS,readBankSnapshot,startBankAuthorization,completeBankAuthorization,isBankAuthorized} from './providers/banks.mjs';
import {BROKER_PROVIDER_DEFINITIONS,readBrokerSnapshot} from './providers/brokers.mjs';
import {fields,fail,digest} from './arithmetic.mjs';
import {importProviderSnapshot,markProviderFailure} from './provider-import.mjs';

export const FINANCE_PROVIDER_DEFINITIONS=[...BANK_PROVIDER_DEFINITIONS,...BROKER_PROVIDER_DEFINITIONS];
const BANK_IDS=new Set(BANK_PROVIDER_DEFINITIONS.map(row=>row.id));
const TTL=10*60*1000;
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

/** One encrypted vault per workspace/provider. GET status is strictly local;
 * all provider requests require an explicit POST from the local application. */
export class FinanceProviderConnections{
 constructor(service,{fetchImpl=fetch,readSnapshot,bankStart=startBankAuthorization,bankComplete=completeBankAuthorization}={}){
  this.service=service;this.now=service.now;this.fetchImpl=fetchImpl;this.readSnapshot=readSnapshot||((id,config,options)=>BANK_IDS.has(id)?readBankSnapshot(id,config,options):readBrokerSnapshot(id,config,options));
  this.bankStart=bankStart;this.bankComplete=bankComplete;this.entries=new Map();
 }
 definition(id){const value=FINANCE_PROVIDER_DEFINITIONS.find(row=>row.id===id);if(!value)fail('财务连接不存在。','not_found',404);return value;}
 entry(id){this.definition(id);if(!this.entries.has(id))this.entries.set(id,{vault:createFinanceVault(path.join(this.service.store.directory,'finance','connections',id)),queue:Promise.resolve(),loaded:false,config:null,preview:null,pending:null,error:null});return this.entries.get(id);}
 async serial(id,operation){const e=this.entry(id),task=e.queue.then(async()=>{if(!e.loaded){const saved=await e.vault.read();e.config=saved?.version===1?saved.config:null;e.loaded=true;}return operation(e);});e.queue=task.catch(()=>{});return task.catch(error=>{if(error instanceof HttpError)throw error;fail('本次连接未能完成，请检查连接设置后重试。','finance_provider_failed',503);});}
 publicStatus(id,e){
  const definition=this.definition(id),sync=this.service.native.syncStatus(id),verified=e.verified||null;
  const values={},secretFields=[];
  for(const field of definition.fields){const value=e.config?.[field.key];if(field.type==='password'||field.type==='file'){if(value)secretFields.push(field.key);}else if(value!==undefined)values[field.key]=value;}
  return {provider:id,...(id==='truelayer'?{callbackUrl:this.service.origin()+this.service.routePrefix+'/connections/truelayer/callback'}:{}),readOnly:true,available:!this.service.isDemo(),configured:Boolean(e.config),authorized:!!e.config&&(!BANK_IDS.has(id)||isBankAuthorized(id,e.config)),connected:Boolean(verified)&&!e.error,status:e.error?'error':verified?'connected':e.config?'configured':'disconnected',values,secretFields,lastVerifiedAt:verified,lastError:e.error,pending:e.pending&&e.pending.expiresAt>this.now()?{...e.pending.public,state:e.pending.nonce,expiresAt:new Date(e.pending.expiresAt).toISOString()}:null,...sync,definition};
 }
 async statuses(){return {providers:await Promise.all(FINANCE_PROVIDER_DEFINITIONS.map(async definition=>this.service.isDemo()?{provider:definition.id,readOnly:true,available:false,configured:false,connected:false,status:'disconnected',definition}:this.serial(definition.id,e=>this.publicStatus(definition.id,e))))};}
 config(id,input,previous){
  const definition=this.definition(id);fields(input,definition.fields.map(row=>row.key));const config={};
  for(const field of definition.fields){
   let value=input[field.key];if(value===undefined&&(field.type==='password'||field.type==='file'))value=previous?.[field.key];
   if(value===undefined||value===''){if(field.required)fail(`请填写${field.label}。`);continue;}
   if(typeof value!=='string'||value.length>(field.type==='file'?24000:4000)||value.includes('\0'))fail(`${field.label}无效。`);
   const options=field.options?.map(option=>typeof option==='string'?option:option.value);
   if(options&&!options.includes(value))fail(`${field.label}选项无效。`);
   config[field.key]=value.trim();
  }
  return config;
 }
 async protectReferences(e,snapshot){
  const accounts=new Map();for(const row of snapshot.accounts||[])accounts.set(row.accountRef,await e.vault.reference('account:'+row.accountRef));
  const transform=async(row,type)=>({...row,accountRef:accounts.get(row.accountRef),...(type==='position'?{positionRef:await e.vault.reference('position:'+row.accountRef+':'+row.positionRef)}:type==='transaction'?{transactionRef:await e.vault.reference('transaction:'+row.accountRef+':'+row.transactionRef)}:{})});
  return {...snapshot,accounts:await Promise.all((snapshot.accounts||[]).map(row=>transform(row,'account'))),positions:await Promise.all((snapshot.positions||[]).map(row=>transform(row,'position'))),transactions:await Promise.all((snapshot.transactions||[]).map(row=>transform(row,'transaction')))};
 }
 safeError(error){return {code:/^[A-Za-z0-9_]{1,100}$/.test(error?.code||'')?error.code:'finance_provider_failed',message:typeof error?.code==='string'&&typeof error.message==='string'?error.message:'连接服务暂时不可用，请稍后重试。'};}
 async request(id,action,method,body={}){
  this.definition(id);if(action==='status'&&method==='GET')return {status:200,value:(await this.statuses()).providers.find(row=>row.provider===id)};
  this.service.permitConnection();if(method!=='POST')fail('连接需要主动操作。','finance_method_not_allowed',405);
  return this.serial(id,async e=>{
   if(action==='configure'){
    const next=this.config(id,body,e.config);await e.vault.write({version:1,config:next});Object.assign(e,{config:next,preview:null,pending:null,error:null,verified:null});
    markProviderFailure(this.service.native,id,'CONFIGURATION_CHANGED');
    return {status:200,value:this.publicStatus(id,e)};
   }
   if(action==='disconnect'){
    fields(body,[]);await e.vault.write({version:1,config:null});Object.assign(e,{config:null,preview:null,pending:null,error:null,verified:null});
    markProviderFailure(this.service.native,id,'DISCONNECTED');return {status:200,value:this.publicStatus(id,e)};
   }
   if(!e.config)fail('请先配置此连接。','finance_provider_not_configured',409);
   try{
    if(action==='start'){
     fields(body,[]);if(!BANK_IDS.has(id))fail('此服务使用访问凭据连接。');
     const nonce=randomBytes(32).toString('base64url'),redirectUri=this.service.origin()+this.service.routePrefix+`/connections/${id}/callback`;
     const started=await this.bankStart(id,e.config,{origin:this.service.origin(),redirectUri,nonce,now:this.now,fetchImpl:this.fetchImpl});
     e.pending={nonce,expiresAt:this.now()+TTL,data:started.private,public:started.public};e.error=null;
     return {status:200,value:{...started.public,state:nonce}};
    }
    if(action==='complete'){
     fields(body,['state','publicToken','accessToken','enrollment','connectionId']);await this.complete(id,e,body);
     return {status:200,value:this.publicStatus(id,e)};
    }
    if(action==='preview'){
     fields(body,[]);e.preview=null;
     const snapshot=await this.protectReferences(e,await this.readSnapshot(id,e.config,{fetchImpl:this.fetchImpl,now:this.now}));
     if(snapshot.provider!==id||snapshot.readOnly!==true||snapshot.complete!==true)fail('服务未返回完整的只读结果。','finance_invalid_provider_response',502);
     const native=this.service.native.document(),archived=new Set(native.metadata.archivedAccountIds||[]);
     const previousAccounts=native.accounts.filter(row=>row.provider===id&&!archived.has(row.id)&&!snapshot.accounts.some(account=>account.accountRef===row.providerAccountRef)).map(({id,name,kind,currency,amount})=>({id,name,kind,currency,amount}));
     const previewId=randomBytes(24).toString('base64url'),expiresAt=this.now()+TTL;
     e.preview={id:previewId,expiresAt,snapshot,configRevision:digest(e.config)};e.verified=new Date(this.now()).toISOString();e.error=null;
     return {status:200,value:{previewId,expiresAt:new Date(expiresAt).toISOString(),provider:id,environment:snapshot.environment,fetchedAt:snapshot.fetchedAt,previousAccounts,canSync:['production','development'].includes(snapshot.environment),accounts:snapshot.accounts.map(row=>({...row,existingAccountId:native.metadata.providerAccountLinks?.[id]?.[row.accountRef]||null,positionCount:snapshot.positions.filter(position=>position.accountRef===row.accountRef).length,transactionCount:snapshot.transactions.filter(transaction=>transaction.accountRef===row.accountRef).length})),positionCount:snapshot.positions.length,transactionCount:snapshot.transactions.length}};
    }
    if(action==='sync'){
     fields(body,['previewId','accountRefs','mappings','accountDecisions']);const preview=e.preview;
     if(!preview||!equal(preview.id,body.previewId)||preview.expiresAt<this.now()||preview.configRevision!==digest(e.config))fail('预览已失效，请重新读取后再同步。','finance_preview_expired',409);
     const result=importProviderSnapshot(this.service.native,preview.snapshot,{accountRefs:body.accountRefs,mappings:body.mappings||{},accountDecisions:body.accountDecisions||{},idempotencyKey:'provider-sync:'+preview.id},this.service.journal);
     const state=await this.service.state();await this.service.broadcast(state);
     return {status:200,value:{...result,state}};
    }
    fail('财务连接接口不存在。','not_found',404);
   }catch(error){
    if(['preview','start','complete'].includes(action)&&error.code!=='finance_provider_authorization_pending'){e.error=this.safeError(error);e.verified=null;markProviderFailure(this.service.native,id,e.error.code);}
    throw error;
   }
  });
 }
 async complete(id,e,input){
  if(!e.pending||e.pending.expiresAt<this.now()||!equal(e.pending.nonce,input.state))fail('本次授权已失效，请重新开始。','finance_callback_invalid',400);
  const pending=e.pending;
  const next=await this.bankComplete(id,e.config,input,{pending:pending.data,now:this.now,fetchImpl:this.fetchImpl});
  await e.vault.write({version:1,config:next});Object.assign(e,{config:next,preview:null,pending:null,error:null,verified:null});
  markProviderFailure(this.service.native,id,'AUTHORIZATION_CHANGED');
 }
 async callback(id){
  this.service.permitConnection();if(id!=='truelayer')fail('此服务不使用跳转回调。','finance_callback_invalid',400);
  // TrueLayer v3 requires a fixed registered return_uri and exposes no state
  // field. This landing page performs no credential exchange. The original
  // same-origin page resumes via POST complete with its local pending nonce;
  // the adapter verifies only the server-retained connectionId with TrueLayer.
  return {returned:true};
 }
}
