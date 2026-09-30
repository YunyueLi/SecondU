import { t } from '../i18n';
import { OpenaiLogoRegular, Code } from '@openai/apps-sdk-ui/components/Icon';
import type { ProviderSettings } from '../../shared/contracts';
import {compatibleProviderPresets} from '../../shared/provider-presets.mjs';

export type Provider = ProviderSettings['provider'];
export const getProviders = (): Array<{ id: Provider; name: string; baseUrl: string; api: ProviderSettings['api']; description: string; model?: string; reasoningEffort?: ProviderSettings['reasoningEffort'];docsUrl?:string;hint?:string }> => [
  { id: 'moonshot', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', api: 'chat_completions', model: 'kimi-k3', reasoningEffort: 'max', description: t('使用 Kimi API', 'Kimi API') },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', api: 'responses', description: t("使用 DeepSeek API", "DeepSeek API") },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', api: 'responses', description: t("使用 OpenAI API", "OpenAI API") },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', api: 'messages', model: 'claude-sonnet-5-5', reasoningEffort: 'low', description: t('直连 Claude API', 'Claude API') },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', api: 'responses', description: t("连接 Claude 等模型", "Claude and other models") },
  ...compatibleProviderPresets.map(p=>({...p,description:t(p.descriptionZh,p.descriptionEn),hint:t(p.hintZh,p.hintEn)})),
  { id: 'custom', name: t("自定义服务", "Custom service"), baseUrl: '', api: 'responses', description: t("兼容 API 或本机服务", "Compatible or local API") },
];
export const providerName = (provider: Provider) => getProviders().find(item => item.id === provider)?.name || provider;
export const protocolName = (protocol: ProviderSettings['api']) => protocol === 'messages' ? 'Messages' : protocol === 'chat_completions' ? 'Chat Completions' : 'Responses';

export function ProviderMark({ provider, size = 20 }: { provider: Provider; size?: number }) {
  const file = provider === 'moonshot' ? 'kimi' : ['deepseek','openrouter','anthropic',...compatibleProviderPresets.map(p=>p.id)].includes(provider) ? provider : undefined;
  const monochrome=['moonshot','openrouter','anthropic','openai','custom'].includes(provider);
  return <span className={`model-provider-mark ${monochrome ? 'is-monochrome' : ''}`} style={{width:size,height:size}} aria-hidden="true">{file ? <img src={`/brand/providers/${file}.svg`} alt="" draggable={false} /> : provider === 'openai' ? <OpenaiLogoRegular /> : <Code />}</span>;
}

/** Local, source-attributed SVG marks and the official Apps SDK UI OpenAI mark. */
export function ProviderLogo({ provider, compact = false }: { provider: Provider; compact?: boolean }) {
  return <span className={`model-provider-logo model-provider-${provider} ${compact ? 'is-compact' : ''}`} aria-hidden="true">
    <ProviderMark provider={provider} size={compact ? 19 : 24} /><span>{providerName(provider)}</span>
  </span>;
}
