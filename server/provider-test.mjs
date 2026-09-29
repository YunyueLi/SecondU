import { createHash } from 'node:crypto';

// Kept only in memory during one test. Never return or persist the key identity.
export function providerIdentity(settings, key) {
  return JSON.stringify({
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
