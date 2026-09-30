import { HttpError } from './store.mjs';
import { providerIds, compatibleProviderPresets } from '../shared/provider-presets.mjs';
import { anthropicHeaders, readProviderTestJson } from './provider-test.mjs';

const defaults={moonshot:'https://api.moonshot.cn/v1',deepseek:'https://api.deepseek.com/v1',openai:'https://api.openai.com/v1',openrouter:'https://openrouter.ai/api/v1',anthropic:'https://api.anthropic.com/v1',...Object.fromEntries(compatibleProviderPresets.map(item=>[item.id,item.baseUrl]))};
export function catalogueSettings(body){
  if(!providerIds.includes(body.provider))throw new HttpError(400,'请选择模型提供方。','invalid_provider');
  const baseUrl=body.baseUrl||defaults[body.provider];
  if(!baseUrl)throw new HttpError(400,'请填写服务地址。','endpoint_required');
  return {provider:body.provider,baseUrl,api:body.provider==='anthropic'?'messages':'chat_completions'};
}
export function validateModelEndpoint(settings){
  let url;try{url=new URL(settings.baseUrl);}catch{throw new HttpError(400,'模型地址无效。','invalid_endpoint');}
  if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new HttpError(400,'模型地址需要 HTTPS 或本机 HTTP，且不能包含凭据或查询。','invalid_endpoint');
  return url.href.replace(/\/+$/,'');
}
export async function discoverModels(settings,key,{fetchImpl=fetch}={}){
  const base=validateModelEndpoint(settings);
  if(typeof key!=='string'||!key.trim())throw new HttpError(409,'请先填写 API Key。','key_required');
  if(/[\r\n\0]/.test(key)||key.length>10000)throw new HttpError(400,'凭据格式无效。','invalid_key');
  let response,payload;
  try{response=await fetchImpl(base+'/models',{headers:settings.provider==='anthropic'?anthropicHeaders(key):{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000),redirect:'error'});payload=await readProviderTestJson(response,2*1024*1024);}catch{throw new HttpError(502,'暂时无法读取模型列表，请重试或手动填写模型。','model_catalogue_unavailable');}
  if(!response.ok)throw new HttpError(response.status===401||response.status===403?401:502,response.status===401||response.status===403?'API Key 未通过提供方验证。':'提供方暂未返回模型目录，可以重试或手动填写。','model_catalogue_unavailable');
  const raw=payload?.data;
  if(!Array.isArray(raw))throw new HttpError(502,'提供方未返回可识别的模型列表，可以手动填写。','model_catalogue_unavailable');
  const seen=new Set(),models=[];
  for(const item of raw){const id=item?.id;if(typeof id!=='string'||!id.trim()||id.length>200||seen.has(id))continue;seen.add(id);const name=item.display_name||item.name||id;models.push({id,name:typeof name==='string'?name.slice(0,200):id});if(models.length>=2000)break;}
  if(!models.length)throw new HttpError(409,'这个账户暂未返回可选模型，请检查使用权限。','models_unavailable');
  return {models,source:'provider'};
}

// A text delta or HTTP 200 alone is not a completed inference. Bound the body,
// require response.completed, and never return raw upstream error payloads.
export async function streamResponseText(response,{maxBytes=2*1024*1024}={}){
  if(!response.ok||!response.body)throw new HttpError(502,`模型请求未完成（HTTP ${response.status}）。`,'inference_failed');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0,completed=false,answer='';
  function consume(block){
    const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')return;
    let event;try{event=JSON.parse(data);}catch{throw new HttpError(502,'模型返回的响应流格式无效。','invalid_inference_stream');}
    if(['response.failed','response.incomplete','error'].includes(event.type))throw new HttpError(502,'模型未完成本次响应，请检查用量或稍后重试。','inference_failed');
    if(event.type==='response.output_text.delta'&&typeof event.delta==='string')answer+=event.delta;
    if(event.type==='response.completed'){
      if(event.response?.status!=='completed'||event.response?.error)throw new HttpError(502,'模型未完成本次响应。','inference_failed');
      const final=(event.response.output??[]).filter(item=>item.type==='message'&&item.role==='assistant').flatMap(item=>item.content??[]).filter(item=>item.type==='output_text'&&typeof item.text==='string').map(item=>item.text).join('\n');
      if(final)answer=final;completed=true;
    }
  }
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw new HttpError(502,'模型响应超过当前读取限制。','inference_too_large');buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+2);}}buffer+=decoder.decode();if(buffer.trim())consume(buffer);if(!completed||!answer.trim())throw new HttpError(502,'连接已建立，但没有收到完成的文本响应。','inference_incomplete');return answer;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
