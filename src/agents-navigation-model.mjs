export const AGENTS_SECTIONS = Object.freeze([
  { id: 'mine', zh: '我的 Agent', en: 'My agents', development: false },
  { id: 'discover', zh: '专家库', en: 'Expert library', development: false },
  { id: 'market', zh: 'Agent 市场', en: 'Agent market', development: true },
  { id: 'dating', zh: 'Agent Dating', en: 'Agent Dating', development: true },
]);

export function agentSection(value) {
  if (value === 'network') return 'market';
  return AGENTS_SECTIONS.some(section => section.id === value) ? value : 'mine';
}

export function isAgentRoomRoute(value) {
  return Boolean(value && !['network', 'market', 'dating', 'discover'].includes(value));
}

export function agentHref(section) {
  const id = agentSection(section);
  return id === 'mine' ? '#agents' : `#agents/${id}`;
}
