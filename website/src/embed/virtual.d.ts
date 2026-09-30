declare module 'virtual:secondu-canonical-examples' {
  const examples: Record<'zh' | 'en', { space: string; bootstrap: import('../../../shared/contracts').Bootstrap; responses: Record<string, unknown> }>;
  export default examples;
}
