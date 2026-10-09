import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { connectorTarget, connectorUrl } from './connector-http.mjs';
import { HttpError, now } from './store.mjs';

const fail = (message, code = 'connector_oauth_error', status = 400) => new HttpError(status, message, code);
const random = () => randomBytes(32).toString('base64url');
const secretBinding = (connector, name) => ({id:`connector:${connector.id}:oauth:${name}`,provider:'oauth',baseUrl:connector.url});
export const oauthSecret = (store, connector, name) => store.getKey(secretBinding(connector,name));
export const setOAuthSecret = (store, connector, name, value) => store.setKey(secretBinding(connector,name),value);
export function clearOAuthSecrets(store, connector, {client = false} = {}) {
  for (const name of ['access','refresh',...(client ? ['client'] : [])]) store.deleteConnectionKeys(`connector:${connector.id}:oauth:${name}`);
}
export function publicOAuth(store, connector) {
  if (connector.authMode !== 'oauth') return undefined;
  const config = connector.oauth || {}, token = connector.oauthToken;
  return {...config,hasClientSecret:!!oauthSecret(store,connector,'client'),authorized:!!oauthSecret(store,connector,'access'),
    ...(token ? {issuer:token.issuer,authorizedAt:token.authorizedAt,expiresAt:token.expiresAt,grantedScopes:token.scopes} : {})};
}
const text = (value,name,max=2000) => {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))throw fail(`${name} 无效。`);
  return value.trim();
};
export function oauthScopes(value) {
  if(!Array.isArray(value)||value.length>100||value.some(v=>typeof v!=='string'||!v||v.length>300||!/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(v)))throw fail('OAuth scopes 必须是有效的权限名称列表。');
  return [...new Set(value)];
}
export function normalizeOAuth(body, previous = {}, allowLocalhost = false) {
  if(body===undefined)return {...previous};
  if(!body||typeof body!=='object'||Array.isArray(body))throw fail('OAuth 应用配置无效。');
  const result={...previous};
  for(const key of ['clientId','issuerUrl','resourceUrl'])if(body[key]!==undefined){
    if(body[key]==='')delete result[key];
    else result[key]=key==='clientId'?text(body[key],key):connectorUrl(text(body[key],key),allowLocalhost).href;
  }
  if(body.scopes===null)delete result.scopes;
  else if(body.scopes!==undefined)result.scopes=oauthScopes(body.scopes);
  if(body.callbackPort!==undefined){
    if(body.callbackPort===0||body.callbackPort===null)delete result.callbackPort;
    else if(!Number.isInteger(body.callbackPort)||body.callbackPort<1024||body.callbackPort>65535)throw fail('OAuth 回调端口须为 1024–65535 的整数，或留空。');
    else result.callbackPort=body.callbackPort;
  }
  if(body.clearClientSecret!==undefined&&typeof body.clearClientSecret!=='boolean')throw fail('clearClientSecret 必须为布尔值。');
  if(body.clientSecret!==undefined&&body.clientSecret!=='')text(body.clientSecret,'clientSecret',10000);
  if(body.clearClientSecret&&body.clientSecret)throw fail('不能同时保存和清除 OAuth 应用密钥。');
  return result;
}

// Only an explicitly selected local resource may use its own loopback origin.
// Remote metadata never grants permission to visit a private network endpoint.
export async function oauthTarget(connector, endpoint, options = {}) {
  let url;try{url=new URL(endpoint);}catch{throw fail('OAuth 服务地址无效。');}
  const resource=new URL(connector.url);
  return connectorTarget({url:url.href,allowLocalhost:!!connector.allowLocalhost&&url.origin===resource.origin},options);
}
export async function oauthRequest(connector, endpoint, {method='GET',headers={},body,signal,...options} = {}) {
  signal?.throwIfAborted();
  const target=await oauthTarget(connector,endpoint,{...options,signal});
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    let response,timer,settled=false,bytes=0;const chunks=[];
    const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);response?.destroy();req.destroy();error?reject(error):resolve(value);};
    const abort=()=>done(Object.assign(new Error('授权操作已取消。'),{name:'AbortError'}));
    const req=(target.url.protocol==='https:'?https:http).request(target.url,{method,headers:{Accept:'application/json',...headers},agent:false,
      lookup:(_host,opts,callback)=>opts.all?callback(null,[{address:target.address,family:target.family}]):callback(null,target.address,target.family)},res=>{
      response=res;
      if(res.statusCode>=300&&res.statusCode<400){done(fail('OAuth 服务返回重定向，未向新地址发送凭据。','connector_oauth_redirect'));return;}
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>524288)done(fail('OAuth 响应超过大小限制。'));else chunks.push(chunk);});
      res.on('end',()=>{const raw=Buffer.concat(chunks).toString('utf8');let json;try{json=JSON.parse(raw);}catch{}done(null,{status:res.statusCode,headers:res.headers,json});});
      res.on('error',()=>done(fail('OAuth 响应中断。','connector_unreachable')));
    });
    timer=setTimeout(()=>done(fail('OAuth 请求超时，请重新发起授权。','connector_timeout')),options.timeoutMs??15000);
    req.on('error',()=>done(fail('无法连接 OAuth 服务。','connector_unreachable')));
    signal?.addEventListener('abort',abort,{once:true});req.end(body);
  });
}
const jsonResponse = (response,label) => {
  if(response.status<200||response.status>=300||!response.json||typeof response.json!=='object'||Array.isArray(response.json))throw fail(`${label}未返回有效结果（HTTP ${response.status}）。`);
  return response.json;
};
const equalIssuer=(a,b)=>new URL(a).href===new URL(b).href;
const inResource=(endpoint,resource)=>{
  const e=new URL(endpoint),r=new URL(resource),base=r.pathname.replace(/\/$/,'');
  return e.origin===r.origin&&(e.pathname===r.pathname||e.pathname===base||e.pathname.startsWith(base+'/'));
};
const unique=(values)=>[...new Set(values)];

export async function discoverOAuth(connector,options={}) {
  const endpoint=new URL(connector.url),manual=connector.oauth?.issuerUrl;
  const challengeResponse=await oauthRequest(connector,connector.url,{...options,method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2025-06-18',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:'oauth-discovery',method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'SecondU',version:'0.1.0'}}})});
  const challenge=challengeResponse.status===401?String(challengeResponse.headers['www-authenticate']||''):'';
  const parameter=name=>{const matches=[...challenge.matchAll(new RegExp(`(?:^|[ ,])${name}="([^"\\\\]*)"`,'gi'))];if(matches.length>1)throw fail('OAuth 认证挑战存在重复字段。');return matches[0]?.[1];};
  const advertised=parameter('resource_metadata'),challengedScope=parameter('scope');
  const prmUrls=advertised?[advertised]:unique([endpoint.origin+'/.well-known/oauth-protected-resource'+endpoint.pathname.replace(/\/$/,''),endpoint.origin+'/.well-known/oauth-protected-resource']);
  let prm;
  for(const url of prmUrls){
    const response=await oauthRequest(connector,url,options);
    if([404,405].includes(response.status)&&!advertised)continue;
    prm=jsonResponse(response,'MCP 资源元数据');break;
  }
  if(!prm&&!manual)throw fail('服务未提供可发现的 OAuth 资源元数据；请填写该服务官方提供的授权签发者地址与应用配置。','connector_oauth_metadata_missing');
  let resource=connector.oauth?.resourceUrl||prm?.resource||connector.url;
  connectorUrl(resource,connector.allowLocalhost);
  if(!inResource(connector.url,resource))throw fail('OAuth resource 与所选 MCP 服务不匹配。','connector_oauth_resource_mismatch');
  if(prm&&(!prm.resource||!inResource(connector.url,prm.resource)||!Array.isArray(prm.authorization_servers)||!prm.authorization_servers.length))throw fail('MCP 资源元数据没有匹配的资源与授权服务器。');
  if(manual&&prm&&!prm.authorization_servers.some(value=>{try{return equalIssuer(value,manual);}catch{return false;}}))throw fail('手工签发者与服务公布的授权服务器不一致。','connector_oauth_issuer_mismatch');
  const issuer=manual||prm.authorization_servers[0],issuerUrl=new URL(issuer);
  await oauthTarget(connector,issuer,options);
  const issuerPath=issuerUrl.pathname.replace(/\/$/,'');
  const urls=unique([issuerUrl.origin+'/.well-known/oauth-authorization-server'+issuerPath,issuerUrl.origin+'/.well-known/openid-configuration'+issuerPath,issuerUrl.href.replace(/\/$/,'')+'/.well-known/openid-configuration']);
  let metadata;
  for(const url of urls){const response=await oauthRequest(connector,url,options);if([404,405].includes(response.status))continue;metadata=jsonResponse(response,'OAuth 授权服务器元数据');break;}
  if(!metadata)throw fail('未发现 OAuth/OIDC 授权服务器元数据。','connector_oauth_metadata_missing');
  if(!metadata.issuer||!equalIssuer(metadata.issuer,issuer))throw fail('OAuth 签发者与元数据不匹配。','connector_oauth_issuer_mismatch');
  if(!metadata.code_challenge_methods_supported?.includes('S256'))throw fail('服务未声明支持 PKCE S256，不能安全继续授权。','connector_oauth_pkce_required');
  if(metadata.response_types_supported&&!metadata.response_types_supported.includes('code'))throw fail('服务不支持授权码流程。');
  for(const name of ['authorization_endpoint','token_endpoint'])await oauthTarget(connector,text(metadata[name],name),options);
  for(const name of ['registration_endpoint','revocation_endpoint'])if(metadata[name])await oauthTarget(connector,text(metadata[name],name),options);
  const scopes=connector.oauth?.scopes??(challengedScope!==undefined?oauthScopes(challengedScope.split(' ').filter(Boolean)):prm?.scopes_supported?oauthScopes(prm.scopes_supported):[]);
  return {issuer:new URL(issuer).href,resource:new URL(resource).href,scopes,authorizationEndpoint:metadata.authorization_endpoint,tokenEndpoint:metadata.token_endpoint,
    registrationEndpoint:metadata.registration_endpoint,revocationEndpoint:metadata.revocation_endpoint,
    tokenAuthMethods:metadata.token_endpoint_auth_methods_supported??['client_secret_basic'],responseIssuerRequired:metadata.authorization_response_iss_parameter_supported===true};
}

export class ConnectorOAuthService {
  constructor(store,{network={},blockedPorts=()=>[58644,58645],onAuthorized,attemptTtlMs=600000,requestGate=(_req,work)=>work()}={}){
    this.store=store;this.network=network;this.blockedPorts=blockedPorts;this.onAuthorized=onAuthorized;this.attemptTtlMs=attemptTtlMs;
    this.attempts=new Map();this.starting=new Set();this.refreshing=new Map();this.closed=false;this.requestGate=requestGate;
  }
  options(){return {...this.network,blockedPorts:this.blockedPorts().filter(Boolean)};}
  connector(id){const c=this.store.require('connectors',id);if(c.kind!=='mcp_http'||c.authMode!=='oauth'||!c.enabled)throw fail('请先启用使用 OAuth 的 MCP 连接。');return c;}
  assertCurrent(c){const current=this.store.get('connectors',c.id);if(this.closed||!current||!current.enabled||current.authMode!=='oauth'||current.revision!==c.revision||current.url!==c.url)throw fail('授权期间连接配置已改变，结果未保存。','connector_oauth_stale',409);return current;}
  finish(attempt,status,message){attempt.status=status;attempt.message=message;attempt.verifier=undefined;attempt.state=undefined;attempt.client=undefined;clearTimeout(attempt.timer);if(attempt.server&&!attempt.closing)attempt.closing=new Promise(resolve=>attempt.server.close(error=>{if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')attempt.closeError=error;resolve();}));}
  invalidate(connectorId){for(const a of this.attempts.values())if(a.connectorId===connectorId&&a.status==='pending')this.finish(a,'error','连接配置已改变，请重新授权。');}
  async start(connectorId){
    if(this.starting.has(connectorId))throw fail('这个连接正在准备授权，请稍候。','connector_oauth_busy',409);
    this.starting.add(connectorId);let attempt;
    try{
      const c=this.connector(connectorId);this.invalidate(connectorId);
      for(const [key,a] of this.attempts)if(a.status!=='pending'&&Date.now()-a.createdAt>900000)this.attempts.delete(key);
      if(this.attempts.size>=32)throw fail('授权尝试过多，请稍后再试。','connector_oauth_busy',429);
      const config=await discoverOAuth(c,this.options());this.assertCurrent(c);
      attempt={id:random(),connectorId,status:'pending',message:'等待在浏览器完成授权。',createdAt:Date.now(),state:random(),verifier:random(),connector:c,config,consumed:false};
      attempt.server=http.createServer((req,res)=>{this.requestGate(req,()=>this.callback(attempt,req,res)).catch(error=>{if(!res.headersSent)res.writeHead(error.status??500);if(!res.writableEnded)res.end('Authorization could not be completed.');});});
      const port=c.oauth?.callbackPort||0;
      if(this.blockedPorts().map(Number).includes(port)&&port)throw fail('回调端口不能使用 SecondU 的应用服务端口。');
      await new Promise((resolve,reject)=>{attempt.server.once('error',()=>reject(fail('授权回调端口被占用，请调整端口或结束已有授权。','connector_oauth_callback_unavailable',409)));attempt.server.listen(port,'127.0.0.1',resolve);});
      attempt.redirectUri=`http://127.0.0.1:${attempt.server.address().port}/oauth/callback`;
      let clientId=c.oauth?.clientId,clientSecret=oauthSecret(this.store,c,'client'),authMethod;
      if(!clientId){
        if(!config.registrationEndpoint)throw fail('服务要求预注册的 OAuth 应用。请填写自己的 client ID；如服务要求，再填写 client secret 与已登记的回调端口。','connector_oauth_client_required');
        const registration=jsonResponse(await oauthRequest(c,config.registrationEndpoint,{...this.options(),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'SecondU',redirect_uris:[attempt.redirectUri],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})}),'OAuth 应用注册');
        clientId=text(registration.client_id,'client_id');clientSecret=registration.client_secret?text(registration.client_secret,'client_secret',10000):undefined;
        authMethod=registration.token_endpoint_auth_method||'none';
        if(registration.redirect_uris&&!registration.redirect_uris.includes(attempt.redirectUri))throw fail('OAuth 应用注册返回了不匹配的回调地址。');
      }
      authMethod??=clientSecret?(config.tokenAuthMethods.includes('client_secret_post')?'client_secret_post':'client_secret_basic'):'none';
      if(!['none','client_secret_post','client_secret_basic'].includes(authMethod)||(!clientSecret&&authMethod!=='none'))throw fail('服务使用了当前未支持的 OAuth 客户端认证方法。');
      if(clientSecret&&!config.tokenAuthMethods.includes(authMethod))throw fail('服务不支持该应用的客户端认证方法。');
      attempt.client={id:clientId,secret:clientSecret,method:authMethod};
      this.assertCurrent(c);this.attempts.set(attempt.id,attempt);
      attempt.expiresAt=new Date(attempt.createdAt+this.attemptTtlMs).toISOString();
      attempt.timer=setTimeout(()=>this.finish(attempt,'expired','授权已过期，请重新开始。'),this.attemptTtlMs);attempt.timer.unref();
      const authorization=new URL(config.authorizationEndpoint);
      for(const [key,value] of Object.entries({response_type:'code',client_id:clientId,redirect_uri:attempt.redirectUri,state:attempt.state,code_challenge:createHash('sha256').update(attempt.verifier).digest('base64url'),code_challenge_method:'S256',resource:config.resource}))authorization.searchParams.set(key,value);
      if(config.scopes.length)authorization.searchParams.set('scope',config.scopes.join(' '));
      return {authorizationUrl:authorization.href,attemptId:attempt.id,expiresAt:attempt.expiresAt,redirectUri:attempt.redirectUri};
    }catch(error){if(attempt)this.finish(attempt,'error','授权准备未完成。');throw error;}
    finally{this.starting.delete(connectorId);}
  }
  status(connectorId,attemptId){
    this.store.require('connectors',connectorId);const a=this.attempts.get(attemptId);
    if(!a||a.connectorId!==connectorId)return {status:'expired',message:'授权已过期或应用已重新启动，请重新开始。'};
    return {status:a.status,message:a.message,...(a.status==='connected'?{connectorId}: {})};
  }
  async tokenRequest(connector,config,client,params){
    const form=new URLSearchParams({...params,resource:config.resource,client_id:client.id}),headers={'Content-Type':'application/x-www-form-urlencoded'};
    if(client.method==='client_secret_post')form.set('client_secret',client.secret);
    if(client.method==='client_secret_basic')headers.Authorization='Basic '+Buffer.from(`${encodeURIComponent(client.id)}:${encodeURIComponent(client.secret)}`).toString('base64');
    const response=await oauthRequest(connector,config.tokenEndpoint,{...this.options(),method:'POST',headers,body:form.toString()});
    if(response.status<200||response.status>=300)throw fail(response.json?.error==='invalid_grant'?'授权已失效，请重新登录服务。':`令牌获取失败（HTTP ${response.status}），未采用服务返回的错误正文。`,response.json?.error==='invalid_grant'?'connector_oauth_reauthorize':'connector_oauth_token_failed');
    const value=jsonResponse(response,'OAuth 令牌');
    const access=text(value.access_token,'access_token',30000);
    if(typeof value.token_type!=='string'||value.token_type.toLowerCase()!=='bearer')throw fail('服务未返回可用的 Bearer 令牌。');
    if(value.expires_in!==undefined&&(!Number.isFinite(Number(value.expires_in))||Number(value.expires_in)<=0||Number(value.expires_in)>315360000))throw fail('服务返回的令牌有效期无效。');
    return {access,refresh:value.refresh_token?text(value.refresh_token,'refresh_token',30000):undefined,expiresAt:value.expires_in?new Date(Date.now()+Number(value.expires_in)*1000).toISOString():undefined,scopes:value.scope!==undefined?oauthScopes(text(value.scope,'scope',30000).split(' ')):config.scopes};
  }
  async callback(a,req,res){
    const respond=(status,message)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>SecondU 授权</title><body><h1>${message}</h1><p>可以关闭这个窗口，返回 SecondU 查看连接状态。</p></body></html>`);};
    let url;try{url=new URL(req.url,a.redirectUri);}catch{return respond(400,'授权回调无效');}
    if(req.method!=='GET'||req.headers.host!==new URL(a.redirectUri).host||url.pathname!=='/oauth/callback')return respond(404,'回调地址无效');
    const states=url.searchParams.getAll('state'),state=states[0];
    if(states.length!==1||!state||!a.state||Buffer.byteLength(state)!==Buffer.byteLength(a.state)||!timingSafeEqual(Buffer.from(state),Buffer.from(a.state)))return respond(400,'授权校验失败');
    if(a.status!=='pending'||a.consumed)return respond(409,'这次授权已处理');
    if(Date.now()>a.createdAt+this.attemptTtlMs){this.finish(a,'expired','授权已过期，请重新开始。');return respond(410,'授权已过期');}
    a.consumed=true;
    try{
      this.assertCurrent(a.connector);
      if(url.searchParams.has('error'))throw fail('服务授权未获同意或未完成，请重新发起。');
      const codes=url.searchParams.getAll('code'),issuers=url.searchParams.getAll('iss');
      if(codes.length!==1||!codes[0]||codes[0].length>10000||issuers.length>1||(a.config.responseIssuerRequired&&!issuers.length)||(issuers.length&&!equalIssuer(issuers[0],a.config.issuer)))throw fail('授权码或签发者校验失败。');
      const client=a.client;
      const tokens=await this.tokenRequest(a.connector,a.config,client,{grant_type:'authorization_code',code:codes[0],redirect_uri:a.redirectUri,code_verifier:a.verifier});
      if(a.status!=='pending'||Date.now()>a.createdAt+this.attemptTtlMs)throw fail('授权已过期或已取消，请重新开始。','connector_oauth_stale',409);
      const current=this.assertCurrent(a.connector);
      const authorized={...current,revision:current.revision+1,updatedAt:now(),lastTest:undefined,tools:[],oauthToken:{...a.config,clientId:client.id,authMethod:client.method,scopes:tokens.scopes,expiresAt:tokens.expiresAt,authorizedAt:now()}};
      this.store.credentialTransaction(()=>{
        setOAuthSecret(this.store,current,'access',tokens.access);setOAuthSecret(this.store,current,'refresh',tokens.refresh);
        setOAuthSecret(this.store,current,'client',client.secret);
        this.store.put('connectors',authorized);
      });
      const result=await this.onAuthorized?.(current.id);
      this.assertCurrent(authorized);
      this.finish(a,'connected',result?.message||'授权已保存，可以验证连接。');respond(200,'服务授权已完成');
    }catch(error){this.finish(a,'error',error instanceof HttpError?error.message:'授权未完成，请重新发起。');respond(400,'服务授权未完成');}
    finally{a.client=undefined;}
  }
  async accessToken(connector){
    if(connector.authMode!=='oauth')return undefined;
    const access=oauthSecret(this.store,connector,'access');
    if(!access)throw fail('请先在浏览器完成此服务授权。','connector_oauth_required');
    if(!connector.oauthToken?.expiresAt||Date.parse(connector.oauthToken.expiresAt)>Date.now()+30000)return access;
    return this.refresh(connector.id);
  }
  async refresh(connectorId){
    if(this.refreshing.has(connectorId))return this.refreshing.get(connectorId);
    const work=this.performRefresh(connectorId);this.refreshing.set(connectorId,work);
    try{return await work;}finally{this.refreshing.delete(connectorId);}
  }
  async performRefresh(connectorId){
    const c=this.connector(connectorId),config=c.oauthToken,refresh=oauthSecret(this.store,c,'refresh');
    if(!config||!refresh)throw fail('服务没有可刷新授权，请重新登录。','connector_oauth_reauthorize');
    const client={id:config.clientId,method:config.authMethod,secret:oauthSecret(this.store,c,'client')};
    let tokens;
    try{tokens=await this.tokenRequest(c,config,client,{grant_type:'refresh_token',refresh_token:refresh});}
    catch(error){if(error.code==='connector_oauth_reauthorize'){this.assertCurrent(c);this.disconnect(connectorId);}throw error;}
    const current=this.assertCurrent(c);
    this.store.credentialTransaction(()=>{setOAuthSecret(this.store,current,'access',tokens.access);if(tokens.refresh)setOAuthSecret(this.store,current,'refresh',tokens.refresh);this.store.put('connectors',{...current,oauthToken:{...config,scopes:tokens.scopes,expiresAt:tokens.expiresAt}});});
    return tokens.access;
  }
  disconnect(connectorId){
    const c=this.store.require('connectors',connectorId);this.invalidate(connectorId);
    this.store.credentialTransaction(()=>{clearOAuthSecrets(this.store,c);this.store.put('connectors',{...c,revision:c.revision+1,updatedAt:now(),oauthToken:undefined,lastTest:undefined,tools:[]});});
  }
  async revoke(connectorId){
    const c=this.connector(connectorId),config=c.oauthToken;
    if(!config?.revocationEndpoint)throw fail('服务未提供标准撤销端点；可在 SecondU 断开，并在服务商的授权管理页撤销。','connector_oauth_revoke_unavailable');
    const refresh=oauthSecret(this.store,c,'refresh'),access=oauthSecret(this.store,c,'access'),token=refresh||access;
    if(!token){this.disconnect(connectorId);return;}
    const form=new URLSearchParams({token,token_type_hint:refresh?'refresh_token':'access_token',client_id:config.clientId}),headers={'Content-Type':'application/x-www-form-urlencoded'};
    const secret=oauthSecret(this.store,c,'client');
    if(config.authMethod==='client_secret_post')form.set('client_secret',secret);
    if(config.authMethod==='client_secret_basic')headers.Authorization='Basic '+Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(secret)}`).toString('base64');
    const response=await oauthRequest(c,config.revocationEndpoint,{...this.options(),method:'POST',headers,body:form.toString()});
    if(response.status!==200)throw fail(`服务撤销未确认（HTTP ${response.status}）；本地连接未改动。`,'connector_oauth_revoke_failed');
    this.assertCurrent(c);this.disconnect(connectorId);
  }
  async close(){this.closed=true;for(const a of this.attempts.values()){if(a.status==='pending')this.finish(a,'expired','应用已关闭，请重新授权。');a.server?.closeIdleConnections();}await Promise.all([...this.attempts.values()].map(a=>a.closing));for(const a of this.attempts.values())if(a.closeError)throw a.closeError;}
}
