// Explicit, bounded Responses -> Chat Completions transport. Codex still owns the
// tool loop, sandbox and approval protocol. No provider fallback or hidden retries.
import http from 'node:http';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { providerHeaders } from './provider-headers.mjs';
import { anthropicHeaders } from './provider-test.mjs';
import { inlineImage, MULTIMODAL_REQUEST_LIMIT } from './attachment-input.mjs';
import { usesDefaultReasoning } from '../shared/provider-presets.mjs';

function unsupported(message){return Object.assign(new Error(`Chat Completions 转接不支持：${message}。请改用原生 Responses 连接。`),{status:400,code:'unsupported_chat_bridge'});}
function contentText(content){
  if(typeof content==='string')return content;
  if(!Array.isArray(content))throw unsupported('非文本消息');
  return content.map(part=>{if(!['text','input_text','output_text'].includes(part?.type)||typeof part.text!=='string')throw unsupported('图片、音频、文件等多模态内容');return part.text;}).join('\n');
}
function userContent(content){
  if(!Array.isArray(content)||!content.some(part=>part?.type==='input_image'))return contentText(content);
  return content.map(part=>{
    if(['text','input_text','output_text'].includes(part?.type)&&typeof part.text==='string')return {type:'text',text:part.text};
    if(part?.type!=='input_image'||typeof part.image_url!=='string')throw unsupported('图片、音频、文件等多模态内容的格式');
    try{inlineImage(part.image_url);}catch(error){throw unsupported(error.message);}
    if(part.detail!==undefined&&!['auto','low','high','original'].includes(part.detail))throw unsupported('图片清晰度参数');
    return {type:'image_url',image_url:{url:part.image_url,...(part.detail&&part.detail!=='original'?{detail:part.detail}:{})}};
  });
}
function toolKey(namespace,name){return JSON.stringify([namespace??'',name]);}
function toolAlias(namespace,name){const raw=namespace?`${namespace}__${name}`:name;return /^[a-zA-Z0-9_-]{1,64}$/.test(raw)?raw:`tool_${createHash('sha256').update(toolKey(namespace,name)).digest('hex').slice(0,32)}`;}
export function toChatRequest(body,settings,reasoningByCall=new Map()){
  if(body.previous_response_id||body.store===true)throw unsupported('服务端会话状态');
  if(body.text?.format&&body.text.format.type!=='text')throw unsupported('结构化输出格式');
  const specs=new Map(),aliases=new Map(),tools=[];
  function add(tool,namespace){
    if(tool.type==='namespace'){if(!Array.isArray(tool.tools))throw unsupported('工具命名空间结构');for(const child of tool.tools)add(child,tool.name);return;}
    if(!['function','custom'].includes(tool.type)||typeof tool.name!=='string')throw unsupported(`工具类型 ${String(tool.type)}`);
    const alias=toolAlias(namespace,tool.name),spec={...tool,namespace,alias};
    if(aliases.has(alias))throw unsupported('重复工具名称');
    specs.set(toolKey(namespace,tool.name),spec);aliases.set(alias,spec);
    tools.push({type:'function',function:{name:alias,description:[tool.description,tool.type==='custom'?'Return the complete free-form tool input in the JSON string field input.':null,tool.format?JSON.stringify(tool.format):null].filter(Boolean).join('\n'),parameters:tool.type==='custom'?{type:'object',properties:{input:{type:'string'}},required:['input'],additionalProperties:false}:tool.parameters??{type:'object',properties:{}}}});
  }
  for(const tool of body.tools??[])add(tool);
  const messages=[];if(body.instructions)messages.push({role:'system',content:contentText(body.instructions)});
  const input=typeof body.input==='string'?[{role:'user',content:body.input}]:body.input;
  if(!Array.isArray(input))throw unsupported('输入结构');
  for(const item of input){
    if(item.type==='message'||(!item.type&&item.role)){
      if(!['developer','system','user','assistant'].includes(item.role))throw unsupported('消息角色');
      messages.push({role:item.role==='developer'?'system':item.role,content:item.role==='user'?userContent(item.content):contentText(item.content)});
    }else if(['function_call','custom_tool_call'].includes(item.type)){
      const spec=specs.get(toolKey(item.namespace,item.name));if(!spec)throw unsupported(`历史工具 ${item.name} 不在当前工具定义中`);
      const args=item.type==='custom_tool_call'?JSON.stringify({input:item.input}):item.arguments;
      if(typeof args!=='string')throw unsupported('工具参数格式');
      let previous=messages.at(-1);if(previous?.role!=='assistant'||!previous.tool_calls){previous={role:'assistant',content:null,tool_calls:[]};messages.push(previous);}
      previous.tool_calls.push({id:item.call_id,type:'function',function:{name:spec.alias,arguments:args}});
      if(reasoningByCall.has(item.call_id))previous.reasoning_content=reasoningByCall.get(item.call_id);
    }else if(['function_call_output','custom_tool_call_output'].includes(item.type))messages.push({role:'tool',tool_call_id:item.call_id,content:contentText(item.output)});
    else throw unsupported(`历史条目 ${String(item.type)}`);
  }
  let toolChoice=body.tool_choice;
  if(toolChoice&&typeof toolChoice==='object'){
    const spec=specs.get(toolKey(toolChoice.namespace,toolChoice.name));if(!spec)throw unsupported('指定工具不在当前定义中');toolChoice={type:'function',function:{name:spec.alias}};
  }
  const request={model:settings.model,messages,stream:false,...(tools.length?{tools,tool_choice:toolChoice??'auto'}:{})};
  if(body.max_output_tokens)request[settings.provider==='openai'?'max_completion_tokens':'max_tokens']=body.max_output_tokens;
  if(settings.provider!=='custom'&&!usesDefaultReasoning(settings.provider)&&settings.reasoningEffort)request.reasoning_effort=settings.reasoningEffort;
  return {request,aliases};
}
export function fromChatResponse(result,aliases,reasoningByCall=new Map()){
  const choice=result?.choices?.[0],message=choice?.message;
  if(result?.error||!message||message.role!=='assistant')throw Object.assign(new Error('提供方未返回有效的 Chat Completions 响应。'),{status:502});
  if(!['stop','tool_calls'].includes(choice.finish_reason))throw Object.assign(new Error(`模型响应没有正常完成（${String(choice.finish_reason)}）。`),{status:502});
  const output=[];
  if(typeof message.content==='string'&&message.content.trim())output.push({id:`msg_${randomUUID()}`,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:message.content,annotations:[]}]});
  for(const call of message.tool_calls??[]){
    const spec=aliases.get(call.function?.name);if(!spec||call.type!=='function'||typeof call.id!=='string')throw Object.assign(new Error('模型返回未声明的工具或无效的工具调用。'),{status:502});
    let args;try{args=JSON.parse(call.function.arguments);}catch{throw Object.assign(new Error('模型工具参数不是有效的 JSON。'),{status:502});}
    if(spec.type==='custom'&&typeof args.input!=='string')throw Object.assign(new Error('模型未返回自定义工具的 input 文本。'),{status:502});
    if(typeof message.reasoning_content==='string')reasoningByCall.set(call.id,message.reasoning_content);
    output.push({id:`call_${randomUUID()}`,type:spec.type==='custom'?'custom_tool_call':'function_call',call_id:call.id,name:spec.name,...(spec.namespace?{namespace:spec.namespace}:{}),status:'completed',...(spec.type==='custom'?{input:args.input}:{arguments:call.function.arguments})});
  }
  if(!output.length)throw Object.assign(new Error('模型返回空响应，未生成文本或工具调用。'),{status:502});
  const response={id:`resp_${randomUUID()}`,object:'response',status:'completed',output};
  const usage=result.usage;
  if([usage?.prompt_tokens,usage?.completion_tokens].every(value=>Number.isSafeInteger(value)&&value>=0)){const input=usage.prompt_tokens,out=usage.completion_tokens;response.usage={input_tokens:input,output_tokens:out,total_tokens:Number.isSafeInteger(usage.total_tokens)&&usage.total_tokens>=0?usage.total_tokens:input+out,input_tokens_details:null,output_tokens_details:null};}
  return response;
}

function messagesUnsupported(message){return Object.assign(new Error(`Anthropic Messages 转接不支持：${message}。`),{status:400,code:'unsupported_messages_bridge'});}
function messagesSignature(request,messages=request.messages){return createHash('sha256').update(JSON.stringify({system:request.system,tools:request.tools,messages})).digest('hex');}
export function toMessagesRequest(body,settings,turns=new Map()) {
  let mapped;
  try{mapped=toChatRequest(body,{...settings,provider:'custom'});}catch(error){if(error.code==='unsupported_chat_bridge')throw messagesUnsupported(error.message.split('：')[1]?.split('。')[0]??error.message);throw error;}
  const {request:chat,aliases}=mapped,system=[],messages=[];
  const append=(role,blocks)=>{if(!blocks.length)return;const last=messages.at(-1);if(last?.role===role)last.content.push(...blocks);else messages.push({role,content:blocks});};
  for(const message of chat.messages){
    if(message.role==='system'){if(message.content)system.push({type:'text',text:message.content});continue;}
    if(message.role==='tool'){append('user',[{type:'tool_result',tool_use_id:message.tool_call_id,content:message.content}]);continue;}
    const blocks=[];
    if(Array.isArray(message.content))for(const part of message.content){
      if(part.type==='text'){if(part.text)blocks.push({type:'text',text:part.text});}
      else if(part.type==='image_url'){
        const image=inlineImage(part.image_url.url);
        if(image.base64.length>10*1024*1024)throw messagesUnsupported('单张图片 base64 编码超过 10 MiB；原件已保留，请手动减小图片后再发送');
        blocks.push({type:'image',source:{type:'base64',media_type:image.mime,data:image.base64}});
      }else throw messagesUnsupported('此多模态内容类型');
    }else if(message.content)blocks.push({type:'text',text:message.content});
    for(const call of message.tool_calls??[]){let input;try{input=JSON.parse(call.function.arguments);}catch{throw messagesUnsupported('工具参数不是 JSON');}if(!input||typeof input!=='object'||Array.isArray(input))throw messagesUnsupported('工具参数必须是 JSON 对象');blocks.push({type:'tool_use',id:call.id,name:call.function.name,input});}
    append(message.role,blocks);
  }
  const maxTokens=body.max_output_tokens??8192;
  if(!Number.isInteger(maxTokens)||maxTokens<1||maxTokens>128000)throw messagesUnsupported('输出 token 限额');
  const request={model:settings.model,max_tokens:maxTokens,stream:false,messages,...(system.length?{system}:{}),...(chat.tools?.length?{tools:chat.tools.map(tool=>({name:tool.function.name,description:tool.function.description,input_schema:tool.function.parameters}))}:{})};
  if(request.tools){const choice=chat.tool_choice??'auto';if(!['auto','none'].includes(choice))throw messagesUnsupported('强制工具选择；当前桥只接受 auto 或 none');request.tool_choice={type:choice,...(typeof body.parallel_tool_calls==='boolean'?{disable_parallel_tool_use:!body.parallel_tool_calls}:{})};}
  for(let index=0;index<messages.length;index++){
    const message=messages[index],calls=message.content.filter(block=>block.type==='tool_use');
    if(message.role==='assistant'&&calls.length){
      const cached=turns.get(calls[0].id);
      if(!cached)throw messagesUnsupported('跨执行恢复的工具历史缺少原始消息块；请在新一轮上下文中继续');
      const cachedCalls=cached.content.filter(block=>block.type==='tool_use');
      if(JSON.stringify(calls)!==JSON.stringify(cachedCalls)||messagesSignature(request,messages.slice(0,index))!==cached.signature)throw messagesUnsupported('工具轮次的原始上下文已变化，不能重放思考块');
      // Preserve exact provider blocks, including opaque thinking/signatures, only
      // in this bridge's memory. Never emit them to UI or persist them as events.
      message.content=cached.content;
      const next=messages[index+1],results=next?.role==='user'?next.content.filter(block=>block.type==='tool_result'):[];
      if(results.length!==calls.length||new Set(results.map(block=>block.tool_use_id)).size!==calls.length||calls.some(call=>!results.some(result=>result.tool_use_id===call.id)))throw messagesUnsupported('工具结果必须紧接并完整对应上一条工具调用');
      next.content=[...results,...next.content.filter(block=>block.type!=='tool_result')];
    }else if(message.content.some(block=>block.type==='tool_result')&&(index===0||!messages[index-1].content.some(block=>block.type==='tool_use')))throw messagesUnsupported('工具结果没有对应的调用');
  }
  if(!messages.length||messages[0].role!=='user'||messages.at(-1).role!=='user')throw messagesUnsupported('对话须以用户消息开始和结束');
  if(Buffer.byteLength(JSON.stringify(request))>32*1024*1024)throw messagesUnsupported('整轮请求超过 32 MiB，请减少图片数量或大小');
  return {request,aliases};
}
export function fromMessagesResponse(result,aliases,turns=new Map(),request) {
  const invalid=message=>Object.assign(new Error(message),{status:502,code:'invalid_messages_response'});
  if(result?.error||result?.type!=='message'||result.role!=='assistant'||!Array.isArray(result.content))throw invalid('提供方未返回有效的 Anthropic Messages 响应。');
  if(!['end_turn','tool_use'].includes(result.stop_reason))throw invalid(`Anthropic 响应未正常完成（${String(result.stop_reason)}）；未重试或自动继续。`);
  const output=[],calls=[];
  for(const block of result.content){
    if(block.type==='text'){
      if(typeof block.text!=='string')throw invalid('Anthropic 文本格式无效。');
      if(block.text.trim())output.push({id:`msg_${randomUUID()}`,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:block.text,annotations:[]}]});
    }else if(block.type==='tool_use'){
      const spec=aliases.get(block.name);
      if(!spec||typeof block.id!=='string'||!block.id||!block.input||typeof block.input!=='object'||Array.isArray(block.input)||calls.some(call=>call.id===block.id))throw invalid('Anthropic 返回未声明、重复或无效的工具调用。');
      if(spec.type==='custom'&&typeof block.input.input!=='string')throw invalid('Anthropic 自定义工具缺少 input 文本。');
      calls.push(block);output.push({id:`call_${randomUUID()}`,type:spec.type==='custom'?'custom_tool_call':'function_call',call_id:block.id,name:spec.name,...(spec.namespace?{namespace:spec.namespace}:{}),status:'completed',...(spec.type==='custom'?{input:block.input.input}:{arguments:JSON.stringify(block.input)})});
    }else if(!['thinking','redacted_thinking'].includes(block.type))throw invalid(`Anthropic 返回当前桥未支持的内容块：${String(block.type)}。`);
  }
  if(!output.length||((result.stop_reason==='tool_use')!==(calls.length>0)))throw invalid('Anthropic 返回空响应，或停止原因与工具调用不一致。');
  if(calls.length){if(!request)throw invalid('缺少工具轮次请求上下文。');const cached={content:result.content,signature:messagesSignature(request)};const bytes=[...new Set(turns.values()),cached].reduce((total,turn)=>total+Buffer.byteLength(JSON.stringify(turn.content)),0);if(turns.size+calls.length>256||bytes>16*1024*1024)throw invalid('Anthropic 本轮工具历史达到内存限额，请结束本轮后继续。');for(const call of calls)turns.set(call.id,cached);}
  const response={id:`resp_${randomUUID()}`,object:'response',status:'completed',output};
  const usage=result.usage;
  if([usage?.input_tokens,usage?.output_tokens,usage?.cache_creation_input_tokens??0,usage?.cache_read_input_tokens??0].every(value=>Number.isSafeInteger(value)&&value>=0)){const input=usage.input_tokens+(usage.cache_creation_input_tokens??0)+(usage.cache_read_input_tokens??0),out=usage.output_tokens;response.usage={input_tokens:input,output_tokens:out,total_tokens:input+out,input_tokens_details:null,output_tokens_details:null};}
  return response;
}

async function boundedJson(stream,max,{drain=false}={}){let size=0;const chunks=[];for await(const chunk of stream){size+=chunk.length;if(size>max){if(!drain)throw Object.assign(new Error('模型转接数据超过安全大小限制。'),{status:413});}else chunks.push(chunk);}if(size>max)throw Object.assign(new Error('模型转接数据超过安全大小限制。'),{status:413});return JSON.parse(Buffer.concat(chunks).toString());}
function nonImageBytes(value,key){
  if(typeof value==='string')return key==='image_url'&&value.startsWith('data:image/')?0:Buffer.byteLength(value);
  if(Array.isArray(value))return value.reduce((sum,item)=>sum+nonImageBytes(item),0);
  if(value&&typeof value==='object')return Object.entries(value).reduce((sum,[key,item])=>sum+Buffer.byteLength(key)+nonImageBytes(item,key),0);
  return 0;
}
function verifyRuntimeImages(body,expected){
  if(!expected)return;
  const parts=(Array.isArray(body.input)?body.input:[]).flatMap(item=>item.role==='user'&&Array.isArray(item.content)?item.content:[]);
  const images=parts.filter(part=>part.type==='input_image');
  const omitted=parts.some(part=>typeof part.text==='string'&&part.text.includes('image content omitted because it could not be processed'));
  if(omitted||images.length<expected)throw Object.assign(new Error('本机运行时无法处理至少一张图片，已停止发送；没有将缺图请求转给模型。原件仍保存在本机，请重新导出有效 PNG、JPEG、WebP 或 GIF 后重试。'),{status:400,code:'image_input_lost'});
  for(const image of images)inlineImage(image.image_url);
}
export async function startChatBridge({settings,apiKey,signal,images=[]}){
  const token=randomUUID(),controllers=new Set(),reasoningByCall=new Map(),messageTurns=new Map(),messages=settings.api==='messages',native=settings.api==='responses';
  const server=http.createServer(async(req,res)=>{
    const controller=new AbortController();controllers.add(controller);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();res.on('close',abort);
    try{
      if(req.method!=='POST'||req.url!=='/responses'||req.headers.authorization!==`Bearer ${token}`)throw Object.assign(new Error('转接请求未授权。'),{status:403});
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw Object.assign(new Error('转接只接受 JSON。'),{status:415});
      const body=await boundedJson(req,MULTIMODAL_REQUEST_LIMIT,{drain:true});
      verifyRuntimeImages(body,images.length);
      const {request,aliases}=native?{request:body}:messages?toMessagesRequest(body,settings,messageTurns):toChatRequest(body,settings,reasoningByCall);
      if(nonImageBytes(body)>4*1024*1024)throw Object.assign(new Error('模型转接的文字和工具上下文超过 4 MiB。图片使用独立限额。'),{status:413});
      const upstream=await fetch(settings.baseUrl.replace(/\/+$/,'')+(native?'/responses':messages?'/messages':'/chat/completions'),{method:'POST',headers:{...(messages?anthropicHeaders(apiKey):{Authorization:`Bearer ${apiKey}`}),'Content-Type':'application/json',...providerHeaders(settings)},body:JSON.stringify(request),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),redirect:'error'});
      if(!upstream.ok){let kind='';if(messages){try{const failure=await boundedJson(upstream.body,65536);if(typeof failure.error?.type==='string')kind=`（${failure.error.type.slice(0,100)}）`;}catch{}}else await upstream.body?.cancel();const hasImages=images.length||(request.messages??[]).some(message=>Array.isArray(message.content)&&message.content.some(part=>['image','image_url'].includes(part.type)));throw Object.assign(new Error(`模型提供方返回 HTTP ${upstream.status}${kind}，未重试或切换模型。${hasImages?' 本轮包含真实图片输入；若提供方不支持图片，请选择支持图片的模型。图片没有被悄悄丢弃或改成纯文字。':''}`),{status:502});}
      if(native){
        // Keep the native Responses stream intact; only verify outgoing images.
        res.writeHead(200,{'Content-Type':upstream.headers.get('content-type')??'application/json','Cache-Control':'no-store'});
        let bytes=0;
        for await(const chunk of upstream.body){bytes+=chunk.length;if(bytes>32*1024*1024)throw Object.assign(new Error('模型响应超过 32 MiB。'),{status:413});if(!res.write(chunk))await once(res,'drain',{signal:controller.signal});}
        res.end();return;
      }
      const payload=await boundedJson(upstream.body,8*1024*1024);
      const response=messages?fromMessagesResponse(payload,aliases,messageTurns,request):fromChatResponse(JSON.parse(JSON.stringify(payload).split(apiKey).join('[redacted]')),aliases,reasoningByCall);
      // Never mutate Anthropic's cached signed blocks while redacting UI output.
      if(messages)for(const item of response.output)if(item.type==='message')for(const content of item.content)content.text=content.text.split(apiKey).join('[redacted]');
      if(controller.signal.aborted)throw Object.assign(new Error('模型请求已取消。'),{name:'AbortError'});
      if(!body.stream){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(response));return;}
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});let sequence=0;
      const event=(type,payload)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...payload})}\n\n`);
      event('response.created',{response:{...response,status:'in_progress',output:[]}});
      for(const [output_index,item] of response.output.entries()){event('response.output_item.added',{output_index,item});event('response.output_item.done',{output_index,item});}
      event('response.completed',{response});res.end();
    }catch(error){if(!res.headersSent){res.writeHead(error.status??502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:error.code??(messages?'messages_bridge_error':'chat_bridge_error'),message:String(error.message).split(apiKey).join('[redacted]').split(token).join('[redacted]')}}));}else res.destroy();}
    finally{controllers.delete(controller);signal?.removeEventListener('abort',abort);}
  });
  server.requestTimeout=130000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {baseUrl:`http://127.0.0.1:${server.address().port}`,token,async close(){for(const c of controllers)c.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));reasoningByCall.clear();messageTurns.clear();}};
}
export async function runConfiguredCodex(options){
  const {runCodex}=await import('./codex.mjs');
  if(options.settings.api==='responses'&&!options.images?.length)return runCodex(options);
  const bridge=await startChatBridge(options);
  try{
    const messages=options.settings.api==='messages';
    await options.onEvent?.(options.settings.api==='responses'?{type:'runtime.image_check',label:'校验图片输入',detail:'确认本机运行时传出了图片内容，再向已选 Responses 连接发送。'}:{type:messages?'runtime.messages_bridge':'runtime.chat_bridge',label:messages?'使用本地 Anthropic Messages 转接':'使用本地 Chat Completions 转接',detail:messages?'支持文本、PNG/JPEG/WebP/GIF 图片、函数及自由文本工具；图片实际识别取决于所选模型。使用模型默认思考设置，不展示原始思考。每次继续执行从任务对话与近期附件重建上下文。':'支持文本、PNG/JPEG/WebP/GIF 图片、函数及自由文本工具；图片实际识别取决于所选模型。上游按完整响应返回，不声称逐 token 流式或全部 Responses 能力。'});
    return await runCodex({...options,...(messages?{threadId:undefined}:{}),settings:{...options.settings,provider:'custom',api:'responses',baseUrl:bridge.baseUrl},apiKey:bridge.token});
  }finally{await bridge.close();}
}
