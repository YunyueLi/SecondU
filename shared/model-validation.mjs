// Validate obvious form mistakes, not availability. Custom gateways may use
// arbitrary local model aliases. OpenRouter also accepts @preset/... and
// ~provider/latest aliases (and model@preset/... combinations).
export function modelIdIssue(provider,model) {
  if(provider==='custom')return;
  const value=String(model??'').trim();
  if(/^(openrouter|openai|anthropic|claude|deepseek|moonshot|kimi|gemini|qwen|glm|doubao|minimax)$/i.test(value))return 'provider_name';
  if(provider==='openrouter'&&!/^[^/\s]+\/[^/\s]+(?:\/[^/\s]+)*$/.test(value))return 'openrouter_format';
}
