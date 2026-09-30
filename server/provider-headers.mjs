export function providerHeaders(settings) {
  return settings.provider==='openrouter' && settings.appTitle ? {'X-OpenRouter-Title':settings.appTitle} : {};
}
