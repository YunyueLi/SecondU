import { createHash } from 'node:crypto';

// Kept only in memory during one test. Never return or persist the key identity.
export function providerIdentity(settings, key) {
  return JSON.stringify({
    id: settings.id,
    revision: settings.revision,
    appTitle: settings.appTitle,
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    api: settings.api,
    reasoningEffort: settings.reasoningEffort,
    key: createHash('sha256').update(key ?? '').digest('hex'),
  });
}

export function validateTextResponse(result) {
  const failure = message => ({ ok: false, message });
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return failure('返回内容不是有效的 Responses 对象，文本连接测试未通过。');
  }
  if (result.error !== undefined && result.error !== null) {
    return failure('提供方返回错误对象，文本连接测试未通过。');
  }
  if (result.status !== undefined && result.status !== 'completed') {
    return failure('提供方未完成这次文本响应，文本连接测试未通过。');
  }
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const directText = nonempty(result.output_text);
  const messageText = Array.isArray(result.output) && result.output.some(item =>
    item && item.type === 'message' && item.role === 'assistant'
    && (item.status === undefined || item.status === 'completed')
    && Array.isArray(item.content)
    && item.content.some(content => content && content.type === 'output_text' && nonempty(content.text)));
  if (!directText && !messageText) {
    return failure('HTTP 请求成功，但未收到非空的 Responses 文本输出，文本连接测试未通过。');
  }
  return { ok: true, message: '提供方已完成一次非空文本响应。工具调用、多模态和长任务能力仍需分别验收。' };
}


export function anthropicHeaders(key) {
  return {'x-api-key':key,'anthropic-version':'2023-06-01'};
}
export function validateMessagesTextResponse(result) {
  if(result?.type!=='message'||result.role!=='assistant'||result.error||result.stop_reason!=='end_turn'||!Array.isArray(result.content)||!result.content.some(block=>block?.type==='text'&&typeof block.text==='string'&&block.text.trim())) {
    return {ok:false,message:'未收到完整且非空的 Anthropic Messages 文本响应，连接测试未通过。'};
  }
  return {ok:true,message:'Anthropic Messages 已完成一次非空文本响应；实际模型的工具与多模态能力仍需分别验收。'};
}

// Keep only standard error.message/code. Provider metadata can contain request
// bodies, routing details or credentials and is never forwarded or persisted.
export function safeProviderText(value, secrets=[]) {
  let text=String(value??'');
  for(const secret of [...new Set(secrets.filter(Boolean))].sort((a,b)=>b.length-a.length))text=text.split(secret).join('[redacted]');
  return text.replace(/\bBearer\s+[^\s"',;<>]+/gi,'Bearer [redacted]')
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_.*-]{4,}/gi,'[redacted]')
    .replace(/(\b(?:api[_ -]?key|x-api-key|access[_ -]?token|token|authorization)\b["']?\s*[:=]\s*["']?)[^\s"',;<>}]+/gi,'$1[redacted]')
    .replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
}
export function providerErrorDetail(payload,secrets=[]) {
  const error=payload?.error;if(!error||typeof error!=='object'||Array.isArray(error))return '';
  const message=typeof error.message==='string'?safeProviderText(error.message,secrets).slice(0,500):'';
  const rawCode=typeof error.code==='string'||(typeof error.code==='number'&&Number.isFinite(error.code))?String(error.code):'';
  const code=safeProviderText(rawCode,secrets).slice(0,80);
  return [code?`[${code}]`:'',message].filter(Boolean).join(' ');
}
export async function readProviderTestJson(response,maxBytes=65536) {
  if(!response.body)return;
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();return;}chunks.push(value);}
    try{return JSON.parse(Buffer.concat(chunks).toString());}catch{return;}
  }finally{reader.releaseLock();}
}
