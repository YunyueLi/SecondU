// Verified against each provider's official documentation on 2026-09-29.
// These are new-connection defaults, never migrations of saved settings.
export const compatibleProviderPresets = [
  {id:'gemini',name:'Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',api:'chat_completions',docsUrl:'https://ai.google.dev/gemini-api/docs/openai',descriptionZh:'Google Gemini API',descriptionEn:'Google Gemini API',hintZh:'填写 Google AI Studio 中可用的模型 ID。',hintEn:'Enter a model ID available in Google AI Studio.'},
  {id:'qwen',name:'Qwen',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',api:'chat_completions',docsUrl:'https://help.aliyun.com/zh/model-studio/base-url',descriptionZh:'阿里云百炼',descriptionEn:'Alibaba Cloud Model Studio',hintZh:'默认使用北京地域；服务地址须与 API Key 的地域和计费方案一致。',hintEn:'Defaults to Beijing. Match the endpoint to your API key region and billing plan.'},
  {id:'glm',name:'GLM',baseUrl:'https://open.bigmodel.cn/api/paas/v4',api:'chat_completions',docsUrl:'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',descriptionZh:'智谱开放平台',descriptionEn:'Zhipu BigModel',hintZh:'这是通用 API 地址；Coding Plan 请按官方文档填写专用地址。',hintEn:'This is the general API endpoint. Coding Plan uses a separate endpoint documented by the provider.'},
  {id:'doubao',name:'Doubao',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',api:'chat_completions',docsUrl:'https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=zh',descriptionZh:'豆包 · 火山方舟',descriptionEn:'Doubao · Volcengine Ark',hintZh:'使用方舟 API Key，填写已开通的模型 ID 或推理接入点 ID。',hintEn:'Use an Ark API key and an enabled model ID or inference endpoint ID.'},
  {id:'minimax',name:'MiniMax',baseUrl:'https://api.minimax.cn/v1',api:'chat_completions',docsUrl:'https://platform.minimax.cn/docs/api-reference/text-openai-api',descriptionZh:'MiniMax 开放平台',descriptionEn:'MiniMax API',hintZh:'默认使用中国站地址；国际站请按对应控制台填写服务地址。',hintEn:'Defaults to the China endpoint. Use the endpoint from your console for international accounts.'},
];
export const providerIds=['moonshot','deepseek','openai','openrouter','anthropic',...compatibleProviderPresets.map(p=>p.id),'custom'];
// Reasoning controls differ by model family. New presets use the provider's
// model defaults until there is a verified per-model parameter mapping.
export const usesDefaultReasoning=provider=>compatibleProviderPresets.some(p=>p.id===provider);
