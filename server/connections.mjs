import { HttpError, id, now } from './store.mjs';
import { choice, text } from './domain.mjs';
import { modelIdIssue } from '../shared/model-validation.mjs';
import { providerIds } from '../shared/provider-presets.mjs';
import { providerIdentity, validateTextResponse, validateMessagesTextResponse, anthropicHeaders, safeProviderText, providerErrorDetail, readProviderTestJson } from './provider-test.mjs';

export function providerHeaders(settings) {
  return settings.provider==='openrouter' && settings.appTitle ? {'X-OpenRouter-Title':settings.appTitle} : {};
}
export function validateConnectionModel(settings) {
  const issue=modelIdIssue(settings.provider,settings.model);
  if(issue)throw new HttpError(400,settings.provider==='openrouter'?'OpenRouter 需要填写完整模型 ID 或 preset（如 openrouter/free），不能填写平台名称。请从官方模型目录复制；不会自动替换你保存的模型。':'请填写具体模型 ID，不能填写厂商或产品名称。','invalid_model_id');
}
export function saveConnection(store,body,existing) {
  const v={...existing,...body},stamp=now();
  const connection={id:existing?.id??id('connection'),name:text(v.name??'模型连接','name',100),provider:choice(v.provider,providerIds,'provider'),model:text(v.model,'model',200),baseUrl:text(v.baseUrl,'baseUrl',2000),api:choice(v.api??'responses',['responses','chat_completions','messages'],'api'),reasoningEffort:choice(v.reasoningEffort??'low',['low','medium','high','max'],'reasoningEffort'),createdAt:existing?.createdAt??stamp,updatedAt:stamp,revision:(existing?.revision??0)+1};
  const clearingOnly=!!existing&&body.clearKey===true&&Object.keys(body).every(key=>key==='clearKey');
  if(!clearingOnly)validateConnectionModel(connection);
  if((connection.provider==='anthropic')!==(connection.api==='messages'))throw new HttpError(400,'Anthropic 直连使用 Messages 协议；其他连接请选择 Responses 或 Chat Completions。');
  if(connection.provider==='moonshot'&&connection.reasoningEffort==='medium')throw new HttpError(400,'Kimi 推理强度只支持 low、high 或 max。');
  let url;try{url=new URL(connection.baseUrl);}catch{throw new HttpError(400,'模型地址无效');}
  if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new HttpError(400,'使用 HTTPS 地址，或本机 HTTP 地址；地址不能含凭据、查询或片段');
  connection.baseUrl=url.href;
  if(v.appTitle){connection.appTitle=text(v.appTitle,'appTitle',100);if(/[^\x20-\x7e]/.test(connection.appTitle))throw new HttpError(400,'OpenRouter 应用名称使用可打印英文字符');}
  let apiKey;
  if(body.apiKey!==undefined&&body.apiKey!==''){apiKey=text(body.apiKey,'apiKey',10000);if(/[\r\n\0]/.test(apiKey))throw new HttpError(400,'密钥格式无效');}
  if(body.clearKey!==undefined&&typeof body.clearKey!=='boolean')throw new HttpError(400,'clearKey 必须为布尔值');
  if(body.clearKey&&apiKey)throw new HttpError(400,'不能同时保存和清除密钥');
  // URL/provider edits never forward the old endpoint's credential to a new endpoint.
  store.credentialTransaction(()=>{if(apiKey)store.setKey(connection,apiKey);else if(body.clearKey)store.setKey(connection,null);else if(existing&&existing.provider===connection.provider&&new URL(existing.baseUrl).href===connection.baseUrl&&store.keyId(existing)!==store.keyId(connection)){const oldKey=store.getKey(existing);if(oldKey)store.setKey(connection,oldKey);}store.put('modelConnections',connection);if(connection.id===store.defaultConnectionId())store.setMeta('settings',connection);});
  return store.publicConnection(connection);
}
export function setDefaultConnection(store,connectionId) {
  const connection=store.connection(connectionId);
  validateConnectionModel(connection);
  store.transaction(()=>{store.setMeta('defaultConnectionId',connectionId);store.setMeta('settings',connection);});
  return {connection:store.publicConnection(connection),defaultConnectionId:connectionId};
}
export function deleteConnection(store,connectionId,runner) {
  store.connection(connectionId);
  if(connectionId===store.defaultConnectionId())throw new HttpError(409,'请先选择另一条默认连接，再删除这条连接。','connection_in_use');
  if(store.list('agents').some(agent=>agent.connectionId===connectionId))throw new HttpError(409,'仍有 Agent 使用这条连接，请先修改其模型选择。','connection_in_use');
  if(store.list('tasks').some(task=>task.connectionId===connectionId))throw new HttpError(409,'已有任务记录绑定这条连接，为保留继续执行的能力，暂时不能删除。可以修改连接配置，或先删除对应任务。','connection_in_use');
  if([...runner.active.values()].some(record=>record.models?.some(model=>model.settings.id===connectionId)))throw new HttpError(409,'这条连接仍在执行任务，请等任务结束或先中断。','connection_in_use');
  store.credentialTransaction(()=>{store.delete('modelConnections',connectionId);store.deleteConnectionKeys(connectionId);});return {ok:true};
}
export function validateChatResponse(result) {
  if(!result||typeof result!=='object'||result.error||!Array.isArray(result.choices))return {ok:false,message:'返回内容不是有效的 Chat Completions 对象，文本连接测试未通过。'};
  const choice=result.choices[0];
  if(choice?.finish_reason!=='stop'||choice?.message?.role!=='assistant'||typeof choice.message.content!=='string'||!choice.message.content.trim())return {ok:false,message:'HTTP 请求成功，但未收到完整且非空的 Chat Completions 文本输出，文本连接测试未通过。'};
  return {ok:true,message:'已完成一次非空文本响应。Chat Completions 转接的工具调用和实际模型能力仍需单独验收。'};
}
export async function testConnection(store,connectionId,{defaultId,cleanError=String}={}) {
  const settings=store.connection(connectionId),key=store.getKey(settings);
  validateConnectionModel(settings);
  const secrets=[key,...Object.values(store.getKeys())];
  if(!key)throw new HttpError(409,'尚未填写这条连接的密钥，未发送请求','key_required');
  const identity=providerIdentity(settings,key),started=Date.now();let outcome;
  try {
    const chat=settings.api==='chat_completions',messages=settings.api==='messages';
    const body=messages?{model:settings.model,messages:[{role:'user',content:'Reply with OK.'}],max_tokens:1024,stream:false}:chat?{model:settings.model,messages:[{role:'user',content:'Reply with OK.'}],max_tokens:64,stream:false}:{model:settings.model,input:'Reply with OK.',max_output_tokens:64,store:false,stream:false};
    const response=await fetch(settings.baseUrl.replace(/\/+$/,'')+(messages?'/messages':chat?'/chat/completions':'/responses'),{method:'POST',headers:{...(messages?anthropicHeaders(key):{Authorization:`Bearer ${key}`}), 'Content-Type':'application/json',...providerHeaders(settings)},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});
    const payload=await readProviderTestJson(response),detail=providerErrorDetail(payload,[...secrets,...Object.values(store.getKeys())]);
    if(!response.ok||payload?.error)outcome={ok:false,message:cleanError(`提供方返回 HTTP ${response.status}。${detail?` ${detail}。`:''}连接测试未通过；请核对模型、地址和密钥。`)};
    else outcome=(messages?validateMessagesTextResponse:chat?validateChatResponse:validateTextResponse)(payload);
  }catch(error){outcome={ok:false,message:safeProviderText(cleanError(`连接测试失败：${error.message}`),[...secrets,...Object.values(store.getKeys())]).slice(0,700)};}
  const current=store.get('modelConnections',connectionId);
  if(!current||(defaultId&&store.defaultConnectionId()!==defaultId)||providerIdentity(current,store.getKey(current))!==identity){
    const message='测试期间模型配置或密钥已改变，过时结果已丢弃；请使用当前配置重新测试。';
    return {status:409,value:{ok:false,stale:true,code:'stale_provider_test',error:message,message,latencyMs:Date.now()-started}};
  }
  const lastTest={...outcome,at:now()};store.put('modelConnections',{...current,lastTest});if(connectionId===store.defaultConnectionId())store.setMeta('settings',{...current,lastTest});
  return {status:200,value:{...lastTest,latencyMs:Date.now()-started}};
}
