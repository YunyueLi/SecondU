import path from 'node:path';
import {lstatSync,readFileSync} from 'node:fs';
import {HttpError} from '../http-error.mjs';
import {digest,fail,operationKey} from './arithmetic.mjs';

export const FINANCE_ADAPTER_ORIGIN='http://127.0.0.1:59131';
const ROUTES=new Map([
  ['state','GET'],['market','GET'],['export','GET'],['updates','POST'],['positions/updates','POST'],['market/refresh','POST'],
  ['connections/moomoo/status','GET'],['connections/moomoo/start','POST'],['connections/moomoo/preview','POST'],
  ['connections/moomoo/appkey/status','GET'],['connections/moomoo/appkey/configure','POST'],['connections/moomoo/appkey/preview','POST'],['connections/moomoo/appkey/sync','POST'],
]);

/** This is a migration bridge selected by a local runtime file, not an HTTP
 * proxy setting. Neither query strings nor request bodies can choose a host. */
export class LocalFinanceAdapter{
  constructor(store,{enabled=true,fetchImpl=fetch,timeoutMs=20000,allowedOrigins=[FINANCE_ADAPTER_ORIGIN]}={}){this.store=store;this.enabled=enabled;this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.allowedOrigins=new Set(allowedOrigins);}
  configuration(){
    if(!this.enabled)return null;
    const file=path.join(this.store.directory,'finance-adapter.json');let info;
    try{info=lstatSync(file);}catch(error){if(error.code==='ENOENT')return null;throw new HttpError(503,'无法读取当前空间的财务桥接配置。','finance_adapter_config_unavailable');}
    if(!info.isFile()||info.isSymbolicLink()||info.size>2048)fail('财务桥接配置必须是当前空间的常规本地文件。','finance_adapter_config_invalid',503);
    let config;try{config=JSON.parse(readFileSync(file,'utf8'));}catch{fail('财务桥接配置不是有效 JSON。','finance_adapter_config_invalid',503);}
    let url;try{url=new URL(config.origin);}catch{}
    if(!config||config.version!==1||Object.keys(config).some(key=>!['version','origin'].includes(key))||!url||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!this.allowedOrigins.has(url.origin))fail('财务桥接仅支持明确允许的本机服务地址。','finance_adapter_origin_denied',503);
    return {origin:url.origin};
  }
  async request(route,method='GET',body,config=this.configuration()){
    const source=/^source\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(route);
    if(ROUTES.get(route)!==method&&!(source&&method==='GET'))fail('财务桥接接口未开放。','finance_adapter_route_denied',404);
    if(!config)fail('当前空间未配置本机财务桥接。','finance_adapter_not_configured',409);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);timer.unref?.();
    try{
      const hasBody=body!==undefined&&method!=='GET'&&method!=='HEAD';
      const response=await this.fetch(`${config.origin}/api/${route}`,{method,redirect:'error',signal:controller.signal,headers:{Accept:source?'image/*,application/octet-stream':'application/json',Origin:config.origin,...(hasBody?{'Content-Type':'application/json'}:{})},...(hasBody?{body:JSON.stringify(body)}:{})});
      const maximum=source?15*1024*1024:8*1024*1024;
      if(Number(response.headers.get('content-length'))>maximum)throw new Error('response too large');
      const chunks=[];let length=0;for await(const chunk of response.body||[]){length+=chunk.length;if(length>maximum){controller.abort();throw new Error('response too large');}chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      if(source&&response.ok)return {status:response.status,bytes,contentType:response.headers.get('content-type')||'application/octet-stream'};
      let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('invalid response');}
      if(!response.ok){const error=value?.error;throw new HttpError(response.status,typeof error?.message==='string'?error.message:'本机财务服务未完成请求。',typeof error?.code==='string'?error.code:'finance_adapter_failed');}
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid response');
      return {status:response.status,value};
    }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(503,'本机财务服务暂时不可用，请检查连接后重试。','finance_adapter_unavailable');}
    finally{clearTimeout(timer);}
  }
  // Preserve the first forwarded optimistic revision on retries, so an upstream
  // success followed by a dropped response remains safely idempotent.
  positionAttempt(input,upstreamRevision,currentRevision){
    const key=operationKey(input.idempotencyKey),prior=this.store.get('financeAdapterAttempts',key),fingerprint=digest(input);
    if(prior){if(prior.fingerprint!==fingerprint)fail('此更新标识已用于其他内容。','finance_idempotency_conflict',409);return prior.body;}
    if(input.expectedRevision!==currentRevision)fail('持仓记录已变化，请刷新后重试。','finance_position_revision_conflict',409);
    const body={...input,expectedRevision:upstreamRevision};this.store.put('financeAdapterAttempts',{id:key,fingerprint,body});return body;
  }
}
