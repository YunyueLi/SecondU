declare module 'virtual:secondu-canonical-examples' {
  const examples: Record<'zh' | 'en', { space: string; bootstrap: import('../../../shared/contracts').Bootstrap; responses: Record<string, unknown> }>;
  export default examples;
}
declare module 'virtual:secondu-development-examples' {
  const examples: Record<'zh' | 'en', { responses: Record<string, unknown> }>;
  export default examples;
}
