import path from 'node:path';
import {FinanceProviderConnections} from './provider-connections.mjs';
import {NativeFinanceStore,projectFinance} from './store.mjs';
import {LocalFinanceAdapter} from './adapter.mjs';
import {createMoomooAppKeyConnection} from './moomoo-appkey.mjs';
import {createMoomooConnection} from './moomoo-oauth.mjs';
import {createFinanceMarket,financeQuoteDefinition} from './market.mjs';
import {FinanceJournal,journalToday} from './journal.mjs';
import {analyzeFinanceJournal} from './analysis.mjs';
import {buildFinanceWeeklyReport} from './weekly-report.mjs';
import {currency,digest,fail,fields} from './arithmetic.mjs';

const isEmpty=value=>fields(value,[]);
function mergedMarket(upstream,native){
  if(!upstream)return native;
  if(!native.quotes.length&&!native.rates.length)return upstream;
  const quotes=new Map();
  for(const item of [...(upstream.quotes||[]),...native.quotes]){
    const key=[item.kind,item.currency,item.symbol||item.id].join('|'),old=quotes.get(key);
    const current=old?.price&&(!item.price||Date.parse(old.asOf)>Date.parse(item.asOf))?old:item;
    quotes.set(key,{...current,positionIds:[...new Set([...(old?.positionIds||[]),...(item.positionIds||[])])]});
  }
  const rates=new Map();for(const row of [...(upstream.rates||[]),...native.rates]){const old=rates.get(row.currency);rates.set(row.currency,old&&Date.parse(old.asOf)>Date.parse(row.asOf)?old:row);}
  return {...upstream,...native,quotes:[...quotes.values()],rates:[...rates.values()],issues:[...(upstream.issues||[]),...native.issues],updatedAt:[upstream.updatedAt,native.updatedAt].filter(Boolean).sort().at(-1)||null,status:[upstream.status,native.status].includes('degraded')?'degraded':[upstream.status,native.status].includes('ready')?'ready':upstream.status,revision:digest({upstream:upstream.revision,native:native.revision})};
}
export class FinanceService{
  constructor(store,{executionPolicy,origin,routePrefix='/api/finance',space='main',now=()=>Date.now(),adapterOptions={},appKeyOptions={},oauthOptions={},providerOptions={},marketOptions={},marketRefreshIntervalMs=60000}={}){
    this.store=store;this.now=now;this.origin=origin;this.routePrefix=routePrefix;this.space=space;this.executionPolicy=executionPolicy;
    this.native=new NativeFinanceStore(store,{now});
    this.journal=new FinanceJournal(store,{now});
    this.providers=new FinanceProviderConnections(this,providerOptions);
    // A fictional or showcase workspace must never consult a personal adapter,
    // including if a configuration file was copied into it accidentally.
    this.adapter=new LocalFinanceAdapter(store,{...adapterOptions,enabled:!this.isDemo()});
    this.appKeyOptions=appKeyOptions;this.oauthOptions=oauthOptions;this.clients=new Set();this.closed=false;this.lastRevision=null;
    this.marketRefreshIntervalMs=marketRefreshIntervalMs;
    this.market=createFinanceMarket({...marketOptions,now,initialState:this.isDemo()?undefined:store.get('meta','financeMarket')?.value,onChange:async snapshot=>{
      if(this.closed)return;
      this.store.setMeta('financeMarket',snapshot);
      await this.broadcast().catch(()=>{});
    }});
  }
  isDemo(){return this.executionPolicy==='showcase'||this.store.meta('profile').demo===true;}
  permitConnection(){if(this.isDemo())fail('当前为示例空间，请进入个人空间连接财务账户。','showcase_read_only',403);}
  adapterConfig(){return this.isDemo()?null:this.adapter.configuration();}
  appkey(){this.permitConnection();return this.appKey??=createMoomooAppKeyConnection({...this.appKeyOptions,now:this.now,storageDir:path.join(this.store.directory,'finance','connections','moomoo-appkey')});}
  oauth(){this.permitConnection();return this.oauthConnection??=createMoomooConnection({...this.oauthOptions,now:this.now,storageDir:path.join(this.store.directory,'finance','connections','moomoo-oauth'),redirectUri:this.origin()+this.routePrefix+'/connections/moomoo/callback'});}
  async load(){
    const config=this.adapterConfig(),upstream=config?(await this.adapter.request('state','GET',undefined,config)).value:null;
    if(upstream&&(!Array.isArray(upstream.accounts)||!Array.isArray(upstream.liabilities)))fail('本机财务服务返回的账户结构无效。','finance_adapter_invalid_state',502);
    const projected=this.project(upstream);
    return {config,upstream,projected,state:this.journalState(projected)};
  }
  project(upstream){
    const nativeMarket=this.market.getState(),quoteIds=new Set(this.marketPositions().map(row=>financeQuoteDefinition(row).id));
    const market=mergedMarket(upstream?.market,{...nativeMarket,quotes:nativeMarket.quotes.filter(row=>row.kind==='fx'||quoteIds.has(row.id))});
    return projectFinance(this.native.document(),market,upstream);
  }
  journalState(projected){
    const journal=this.journal.read(),analysis=this.analyze(journal,projected);
    return {...projected,journal,analysis,revision:digest({finance:projected.revision,journal:journal.revision})};
  }
  analyze(journal,state,options={}){
    const today=journalToday(this.now());
    return analyzeFinanceJournal(journal,{today,month:options.month??today.slice(0,7),currency:options.currency??state.metadata.onboarding.displayCurrency,rates:state.valuation.rates});
  }
  async state(){return (await this.load()).state;}
  marketPositions(){return [...this.native.document().positions,...this.journal.read().watchlist.filter(row=>!row.archived)];}
  async refreshMarket(state){
    if(this.isDemo()||this.closed)return this.market.getState();
    const current=state||await this.state();
    const doc=this.native.document();
    const positions=this.marketPositions();
    return this.market.refresh({positions,currencies:[...new Set([...doc.accounts,...positions].map(row=>row.currency))],displayCurrency:current.metadata.onboarding.displayCurrency});
  }
  async refreshMarketIfUseful(){
    if(this.marketPending||this.closed||this.isDemo())return;
    const doc=this.native.document(),displayCurrency=doc.metadata.onboarding.displayCurrency;
    if(!this.marketPositions().length&&!doc.accounts.some(row=>row.currency!==displayCurrency))return;
    const state=await this.state();
    if(!state.metadata.onboarding.completed)return;
    this.marketPending=this.refreshMarket(state).catch(()=>{}).finally(()=>{this.marketPending=null;});
    await this.marketPending;
  }
  demoStatus(method){return {provider:'moomoo',...(method==='appkey'?{method:'appkey',configured:false,scopeVerified:false,algorithm:null,lastVerifiedAt:null}:{}),connected:false,status:'disconnected',readOnly:true,available:false,canSync:false,reason:'showcase',accountSuffixes:[],scopes:[],expiresAt:null,...this.native.syncStatus(method)};}
  async connection(route,method,body){
    const appkey=route.startsWith('connections/moomoo/appkey/'),action=route.split('/').at(-1),providerMethod=appkey?'appkey':'oauth';
    const allowed=appkey?['status','configure','preview','sync']:['status','start','preview','sync'];
    if(!allowed.includes(action)||route!==`connections/moomoo/${appkey?'appkey/':''}${action}`)fail('财务连接接口不存在。','not_found',404);
    if(action==='status'&&method==='GET'&&this.isDemo())return {status:200,value:this.demoStatus(providerMethod)};
    this.permitConnection();
    const config=this.adapterConfig();
    if(config){
      if(!appkey&&action==='sync')fail('当前本机 OAuth 连接支持账户预览，暂不支持保存同步。','finance_sync_unavailable',409);
      const result=await this.adapter.request(route,method,body,config);
      return action==='status'?{...result,value:{...result.value,canSync:appkey,...(!appkey?{syncUnavailableReason:'当前本机 OAuth 连接仅支持账户预览。'}:{})}}:result;
    }
    const provider=appkey?this.appkey():this.oauth();
    if(action==='status'&&method==='GET')return {status:200,value:{...await provider.status(),...this.native.syncStatus(providerMethod),available:true,canSync:true,...(this.callbackError?{lastError:this.callbackError}:{})}};
    if(method!=='POST')fail('连接接口需要主动操作。','finance_method_not_allowed',405);
    if(appkey&&action==='configure'){
      fields(body,['appKeyId','privateKeyPem']);if(typeof body.appKeyId!=='string'||typeof body.privateKeyPem!=='string'||body.privateKeyPem.length>12000)fail('请填写 AppKey ID 和配套私钥。');
      return {status:200,value:await provider.configure({...body,userInitiated:true})};
    }
    if(!appkey&&action==='start'){isEmpty(body);this.callbackError=null;return {status:200,value:await provider.start({userInitiated:true})};}
    if(action==='preview'){fields(body,['currency']);return {status:200,value:await provider.preview({currency:currency(body.currency),userInitiated:true})};}
    if(action==='sync'){
      fields(body,['currency']);const displayCurrency=body.currency===undefined?this.native.document().metadata.onboarding.displayCurrency:currency(body.currency);
      try{const result=this.native.importMoomoo(await provider.preview({currency:displayCurrency,userInitiated:true}),providerMethod);const state=await this.state();await this.broadcast(state);return {status:200,value:{...result,stateRevision:state.revision,state}};}
      catch(error){this.native.markMoomooFailure(providerMethod,error.code);await this.broadcast().catch(()=>{});throw error;}
    }
    fail('财务连接接口不存在。','not_found',404);
  }
  async completeCallback(params){
    this.permitConnection();
    if(this.adapterConfig())fail('本机桥接的授权回调由原服务处理。','finance_callback_invalid',400);
    if([...params.keys()].some(key=>!['code','state','error','error_description'].includes(key))||params.getAll('state').length!==1||params.getAll('code').length>1||params.getAll('error').length>1||params.has('code')&&params.has('error'))fail('授权回调格式无效。','finance_callback_invalid',400);
    try{await this.oauth().completeCallback({state:params.get('state'),code:params.get('code'),error:params.get('error')});this.callbackError=null;}
    catch(error){this.callbackError={code:error.code||'AUTHORIZATION_FAILED',message:'本次授权未完成，请重新连接。'};throw error;}
  }
  async request(route,method,body={}){
    if(route.startsWith('connections/moomoo/'))return this.connection(route,method,body);
    if(route==='connections'&&method==='GET')return {status:200,value:await this.providers.statuses()};
    const providerRoute=route.match(/^connections\/([a-z][a-z0-9_]+)\/([a-z]+)$/);
    if(providerRoute)return this.providers.request(providerRoute[1],providerRoute[2],method,body);
    if(route==='state'&&method==='GET')return {status:200,value:await this.state()};
    if(route==='market'&&method==='GET')return {status:200,value:(await this.state()).market};
    if(route==='journal/analysis'&&method==='POST'){
      fields(body,['month','currency']);const state=await this.state();
      return {status:200,value:{analysis:this.analyze(state.journal,state,body)}};
    }
    if(route==='journal/weekly'&&method==='POST'){
      fields(body,['through','currency']);const state=await this.state();
      const report=buildFinanceWeeklyReport(state.journal,{through:body.through,currency:body.currency??state.metadata.onboarding.displayCurrency,rates:state.valuation.rates,today:journalToday(this.now())});
      return {status:200,value:{report}};
    }
    if(route.startsWith('journal/')){
      const {state:before,projected}=await this.load(),accounts=[...before.accounts,...before.liabilities,...before.archivedAccounts];let result;
      const recordRoute=route.match(/^journal\/records\/([A-Za-z]+)(\/archive)?$/);
      if(recordRoute&&method===(recordRoute[2]?'PUT':'POST'))result=recordRoute[2]?this.journal.archiveRecord(recordRoute[1],body):this.journal.saveRecord(recordRoute[1],body,{accounts});
      else if(route==='journal/import'&&method==='POST')result=this.journal.importTransactions(body,{accounts});
      else if(route==='journal/snapshots'&&method==='POST')result=this.journal.capture(before,body);
      else if(route==='journal/dashboard'&&method==='PUT')result=this.journal.saveDashboard(body);
      else fail('财务记录接口不存在。','not_found',404);
      const state=this.journalState(projected);await this.broadcast(state);return {status:200,value:{...result,state}};
    }
    if(route==='onboarding'&&method==='PUT'){this.native.onboarding(body);await this.refreshMarketIfUseful();const state=await this.state();await this.broadcast(state);return {status:200,value:{state}};}
    if(route==='accounts/archive'&&method==='PUT'){
      const before=await this.state();this.native.archiveAccount(body,[...before.accounts,...before.liabilities,...before.archivedAccounts]);
      const state=await this.state();await this.broadcast(state);return {status:200,value:{state}};
    }
    if((route==='accounts'&&method==='POST')||(route==='accounts/profile'&&method==='PUT')){
      const {upstream,state:before}=await this.load(),accounts=[...before.accounts,...before.liabilities];
      const result=route==='accounts'?this.native.createAccount(body,{accounts}):this.native.updateAccountProfile(body,{accounts});
      const state=this.journalState(this.project(upstream));await this.broadcast(state);return {status:result.replayed?200:201,value:{...result,state}};
    }
    if(route==='positions'&&method==='POST'){
      if(typeof body?.accountId==='string'&&!this.native.document().accounts.some(row=>row.id===body.accountId)&&this.adapterConfig()){
        const {upstream}=await this.load();
        if(upstream?.accounts.some(row=>row.id===body.accountId))fail('当前账户不支持手工新增持仓，请新建本机手工账户。','finance_position_create_unavailable',409);
      }
      const result=this.native.createPosition(body),state=await this.state();await this.broadcast(state);return {status:result.replayed?200:201,value:{...result,state}};
    }
    if(['updates','positions/updates'].includes(route)&&method==='POST'){
      const {config,upstream,state:before}=await this.load(),nativeAccount=this.native.document().accounts.some(row=>row.id===body.accountId);
      let result,status;
      if(!nativeAccount&&config){const payload=route==='positions/updates'?this.adapter.positionAttempt(body,upstream.positions?.revision,before.positions.revision):body;const remote=await this.adapter.request(route,method,payload,config);result=remote.value;status=remote.status;}
      else{result=route==='updates'?this.native.updateAccount(body,{accounts:[...before.accounts,...before.liabilities]}):this.native.updatePosition(body,{currentRevision:before.positions.revision});status=result.replayed?200:201;}
      const state=nativeAccount?this.journalState(this.project(upstream)):await this.state();await this.broadcast(state);return {status,value:{...result,state}};
    }
    if(route==='market/refresh'&&method==='POST'){
      isEmpty(body);const {config,state:before}=await this.load();
      if(config){const remote=await this.adapter.request(route,method,body,config);await this.refreshMarketIfUseful();const state=await this.state();await this.broadcast(state);return {status:remote.status,value:{...remote.value,state,refreshed:remote.value.refreshed??true}};}
      if(this.isDemo())return {status:200,value:{state:before,refreshed:false,message:'示例空间不请求真实行情。'}};
      const market=await this.refreshMarket(before);
      const state=await this.state();await this.broadcast(state);const refreshed=market.quotes.some(quote=>quote.price!==null&&quote.price!==undefined&&!['stale','unavailable','unmapped'].includes(quote.status));
      return {status:200,value:{...market,state,refreshed,...(!refreshed?{message:market.issues?.[0]?.message||'暂无可以刷新的公开行情，请添加带明确市场代码的持仓。'}:{})}};
    }
    if(route==='export'&&method==='GET')return {status:200,value:await this.state()};
    if(route.startsWith('source/')&&method==='GET')return this.adapter.request(route,method);
    fail('财务接口不存在。','not_found',404);
  }
  async stream(req,res){
    const state=await this.state();res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`retry: 2000\nevent: state\ndata: ${JSON.stringify({revision:state.revision})}\n\n`);this.clients.add(res);
    const remove=()=>{this.clients.delete(res);if(!this.clients.size){clearInterval(this.pollTimer);this.pollTimer=null;clearInterval(this.marketTimer);this.marketTimer=null;}};res.once('close',remove);
    if(!this.pollTimer){this.pollTimer=setInterval(()=>{if(this.polling||this.closed)return;this.polling=true;this.broadcast().catch(()=>{for(const client of this.clients)client.write('event: error\ndata: {"message":"财务数据暂时无法更新。"}\n\n');}).finally(()=>{this.polling=false;});},2000);this.pollTimer.unref?.();}
    if(!this.marketTimer){void this.refreshMarketIfUseful().catch(()=>{});this.marketTimer=setInterval(()=>void this.refreshMarketIfUseful().catch(()=>{}),this.marketRefreshIntervalMs);this.marketTimer.unref?.();}
  }
  async broadcast(state){
    if(!this.clients.size||this.closed)return;const next=state||await this.state();if(this.lastRevision===next.revision)return;this.lastRevision=next.revision;
    for(const client of this.clients){if(client.destroyed||client.writableLength>128*1024){client.destroy();this.clients.delete(client);}else client.write(`event: state\ndata: ${JSON.stringify({revision:next.revision})}\n\n`);}
  }
  async close(){this.closed=true;clearInterval(this.pollTimer);clearInterval(this.marketTimer);for(const client of this.clients)client.end();this.clients.clear();await this.market.close?.();await this.marketPending;}
}
