import type { Bootstrap, Person, Relationship } from '../../shared/contracts';

/** Deterministic authored fiction for the component catalogue. Never persisted or sent to an API. */
export function createGraphFixture(count = 800, locale: 'zh-CN'|'en' = 'zh-CN'): Bootstrap {
  if (!Number.isInteger(count) || count < 500 || count > 1000) throw new Error('图谱示例需要 500 至 1000 个虚构人物。');
  const text=(zh:string,en:string)=>locale==='en'?en:zh;
  const sourceId = 'graph-stress-fiction';
  const stamp = '2026-09-29T00:00:00.000Z';
  const labels = [text('项目协作','Project collaborators'), text('共同研究','Research partners'), text('社区朋友','Community friends'), text('长期同事','Long-term colleagues'), text('兴趣伙伴','Shared interests')];
  const personId = (index: number) => `stress-person-${String(index).padStart(4, '0')}`;
  const people: Person[] = Array.from({ length: count }, (_, index) => {
    const group = Math.floor(index / 40) + 1;
    return { id: personId(index), name: text(`人物 ${String(index + 1).padStart(3, '0')}`,`Person ${String(index + 1).padStart(3, '0')}`), role: text(`${labels[(group-1)%labels.length]}，第 ${group} 组`,`${labels[(group-1)%labels.length]}, group ${group}`), description: text(`这是第 ${group} 个小组中的虚构成员，用于检验关系背景阅读、节点检索与局部关系聚焦。`,`Fictional member of group ${group}, used to test relationship context, search, and focusing on nearby connections.`), sourceIds: [sourceId] };
  });
  const relationships: Relationship[] = [];
  const pairs = new Set<string>();
  function connect(a: number, b: number, label: string) {
    if (a === b || b >= count) return;
    const pair = [a, b].sort((x, y) => x - y).join(':');
    if (pairs.has(pair)) return;
    pairs.add(pair);
    relationships.push({ id: `stress-relation-${relationships.length}`, from: personId(a), to: personId(b), label, description: text(`人物 ${a + 1} 与人物 ${b + 1} 的虚构${label}关系。用于检查连边筛选、关联人物跳转及来源查看。`,`Fictional ${label} connection between Person ${a + 1} and Person ${b + 1}, used to test filtering, navigation, and sources.`), sourceIds: [sourceId] });
  }
  // Uneven communities, hubs, peripheral contacts and a few bridges.
  // The fixture represents relationship topology, not a uniform ring mesh.
  for (let index = 0; index < count; index++) {
    const base = Math.floor(index / 40) * 40, local = index - base;
    const group = Math.floor(index / 40);
    if (local === 39) continue; // An unconnected contact in each community.
    if (local > 0) connect(index, base, labels[group % labels.length]);
    if (local > 4 && local < 35) connect(index, base + 1 + local % 4, labels[(group + 1) % labels.length]);
    if (local > 8 && local % 3 === 0) connect(index, index - 1, text('兴趣伙伴','Shared interests'));
    if (local === 0 && group % 4 !== 0) connect(index, base - 40, text('跨组协作','Cross-group collaboration'));
    if (local === 0 && group > 3 && group % 5 === 0) connect(index, base - 160, text('跨组协作','Cross-group collaboration'));
  }
  return {
    version: 'graph-fixture-v1', projects: [], modelConnections: [], defaultConnectionId: '',
    profile: { name: text('图谱性能示例','Graph performance example'), description: text('人物、关系与来源全部为程序生成的虚构样本，不使用当前个人资料。','People, relationships, and sources are fictional generated samples. No personal data is used.'), demo: true },
    sources: [{ id: sourceId, title: text('图谱性能测试虚构数据','Fictional graph performance data'), kind: 'document', text: text(`这是一份包含 ${count} 位虚构人物的性能测试样本。节点、人物背景、关系、群组均由确定性脚本生成，不对应真实人物。`,`A performance sample with ${count} fictional people. Nodes, backgrounds, relationships, and groups are generated deterministically and do not represent real people.`), createdAt: stamp, demo: true }],
    people, relationships,
    facts: [], events: [], conversations: [], goals: [], agents: [], agentRooms: [], tasks: [], artifacts: [], automations: [],
    settings: { provider: 'custom', model: 'fixture-no-model', baseUrl: 'http://127.0.0.1/', api: 'responses', hasKey: false, reasoningEffort: 'medium' },
    computer: { id: 'graph-fixture', name: text('组件目录示例','Component catalogue example'), platform: 'fixture', status: 'offline', workspace: text('仅浏览器内存','Browser memory only'), codexAvailable: false },
  };
}

export const graphFixture = createGraphFixture();

const englishGraphFixture = createGraphFixture(800,'en');
export function getGraphFixture(locale: 'zh-CN'|'en') { return locale==='en'?englishGraphFixture:graphFixture; }
