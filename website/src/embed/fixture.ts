import type { Bootstrap, Artifact, Task } from '../../../shared/contracts';

// Authored for the public website. No snapshot of a user's workspace is used.
export function createWebsiteExample(language: 'zh' | 'en'): Bootstrap {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  const stamp = '2026-10-01T08:00:00.000Z';
  const taskId = 'website-weekend';
  const artifacts: Artifact[] = [
    { id: 'website-plan', name: t('周末安排.md', 'weekend-plan.md'), type: 'markdown', content: t('# 给周末留一点空白\n\n## 周六：城市与日常\n\n**14:00 — 看一场展览**\n\n先看感兴趣的作品，不急着把每个展厅走完。带一本小笔记，记下一个想继续了解的问题。\n\n**16:00 — 沿着街区走一走**\n\n留半小时随意散步，再找一家安静的餐厅。\n\n## 周日：阅读与整理\n\n- 上午读完一篇长文，写下三个问题。\n- 下午回看本周笔记，选一个下周想尝试的小方向。\n\n## 出发前确认\n\n- 选定展览并核对开放时间。\n- 根据展览地点选择餐厅，确认是否需要预约。', '# Leave a little room in your weekend\n\n## Saturday: City and everyday life\n\n**14:00 — Visit an exhibition**\n\nStart with work that interests you. There is no need to visit every room. Bring a notebook and keep one question you want to explore.\n\n**16:00 — Walk around the neighborhood**\n\nLeave half an hour to wander, then find a quiet restaurant.\n\n## Sunday: Read and reflect\n\n- Read a long article and write down three questions.\n- Review the week’s notes and choose one small idea to try next week.\n\n## Before heading out\n\n- Choose an exhibition and check its opening hours.\n- Pick a restaurant nearby and check whether a reservation is needed.'), version: 1, taskId, versions: [], updatedAt: stamp, origin: { kind: 'demo' } },
    { id: 'website-checklist', name: t('随身清单.csv', 'packing-list.csv'), type: 'text', content: t('物品,用途,准备情况\n笔记本,记录想法,待准备\n水杯,步行途中,已准备\n轻便外套,傍晚出门,待准备', 'Item,Purpose,Status\nNotebook,Record ideas,To pack\nWater bottle,For the walk,Ready\nLight jacket,Evening walk,To pack'), version: 1, taskId, versions: [], updatedAt: stamp, origin: { kind: 'demo' } },
  ];
  for (const artifact of artifacts) artifact.versions = [{ version: 1, content: artifact.content, createdAt: stamp, author: t('计划专家', 'Planning specialist') }];
  const prompt = t('帮我安排一个轻松的周末，想看展，也留一点阅读和散步的时间。', 'Help me plan a relaxed weekend with an exhibition, some reading and time for a walk.');
  const task: Task = { id: taskId, title: t('给周末留一点空白', 'Leave a little room in the weekend'), prompt, mode: 'demo', status: 'completed', interaction: 'chat', agentIds: ['website-planner'], contextFactIds: ['website-pace', 'website-quiet'], digitalTwinEnabled: true, createdAt: stamp, updatedAt: stamp, artifactIds: artifacts.map(a => a.id), approvals: [], events: [{ id: 'website-context', type: 'personal_context', label: t('参考已确认的偏好', 'Use confirmed preferences'), detail: t('保留空白时间，选择安静的用餐环境。', 'Leave some time unplanned and choose a quiet place to eat.'), createdAt: stamp }], messages: [
    { id: 'website-question', role: 'user', content: prompt, createdAt: stamp },
    { id: 'website-answer', role: 'assistant', content: t('周六下午看展和散步，周日安排阅读，其余时间留空。\n\n出发前还需要选定展览、核对开放时间，再挑一家附近的安静餐厅。周末安排和随身清单已整理好，可以继续调整。', 'Saturday afternoon is for an exhibition and a walk; Sunday is for reading, with the rest of the weekend left open.\n\nChoose an exhibition and check its opening hours, then pick a quiet restaurant nearby. The weekend plan and packing list are ready to adjust.'), createdAt: stamp },
  ] };
  const sourceId = 'website-note';
  const facts = [
    { id: 'website-pace', kind: 'preference' as const, statement: t('周末喜欢留一些不安排事情的时间。', 'Prefers to keep some weekend time unplanned.') },
    { id: 'website-quiet', kind: 'preference' as const, statement: t('外出用餐偏好安静、适合聊天的环境。', 'Prefers quiet restaurants where conversation is easy.') },
  ].map(fact => ({ ...fact, status: 'confirmed' as const, sourceIds: [sourceId], updatedAt: stamp, version: 1, history: [{ version: 1, statement: fact.statement, status: 'confirmed' as const, reason: t('整理自周末笔记', 'Recorded from the weekend note'), recordedAt: stamp }] }));
  const agents = [
    { id: 'hither', name: 'SecondU', role: t('你的个人数字分身', 'Your personal digital twin'), instructions: t('在授权范围内理解背景，组织专家与工具。', 'Understand context and organize experts and tools within the authorized scope.') },
    { id: 'website-planner', name: t('计划专家', 'Planning specialist'), role: t('把想法整理成可调整的安排', 'Turn ideas into flexible plans'), instructions: t('先理解目标与偏好，留出余地，区分建议与实际执行。', 'Understand goals and preferences, leave room for change and distinguish suggestions from execution.') },
    { id: 'website-researcher', name: t('研究专家', 'Research specialist'), role: t('整理资料，保留可核对的来源', 'Organize materials with traceable sources'), instructions: t('核对资料来源，保留不确定性。', 'Check sources and preserve uncertainty.') },
  ].map(agent => ({ ...agent, avatarStyle: 'notionists' as const, createdAt: stamp }));
  const settings = { provider: 'moonshot' as const, model: 'kimi-k3', baseUrl: 'https://api.moonshot.cn/v1', api: 'chat_completions' as const, hasKey: false, reasoningEffort: 'high' as const };
  return {
    version: '0.1.0', executionPolicy: 'showcase', executionSettings: { approvalMode: 'ask' },
    profile: { name: language === 'en' ? 'Avery' : '云杉', description: t('喜欢阅读、看展和散步，周末偏好宽松的安排。', 'Enjoys reading, exhibitions and walks, with room to be flexible on weekends.'), demo: true, demoLocale: language === 'en' ? 'en' : 'zh-CN', selfPersonId: 'website-self', exampleTaskIds: [taskId] },
    sources: [{ id: sourceId, title: t('一段关于周末的笔记', 'A note about weekends'), kind: 'note', text: t('我喜欢周末留一点空白。看展之后随意走走，找个安静的地方吃饭就很好。', 'I like leaving some room in the weekend. A slow walk after an exhibition and a quiet place to eat sounds good.'), createdAt: stamp, demo: true }],
    facts, people: [{ id: 'website-self', name: language === 'en' ? 'Avery' : '云杉', role: t('本人', 'Self'), description: t('把工作与生活安排得松弛一些。', 'Making a little more room in work and everyday life.'), sourceIds: [sourceId] }], relationships: [],
    events: [{ id: 'website-event', date: '2026-10-03', title: t('周末看展计划', 'Weekend exhibition plan'), description: t('暂定安排，还没有预订。', 'A tentative plan. Nothing has been booked.'), category: 'life', personIds: ['website-self'], sourceIds: [sourceId] }], conversations: [],
    goals: [{ id: 'website-goal', title: t('每周留一段自己的时间', 'Keep some time for myself each week'), description: t('阅读、散步或看展，按当周状态调整。', 'Read, walk or see an exhibition; adjust to how the week feels.'), status: 'active', sourceIds: [sourceId] }], goalLists: [], agents,
    agentRooms: [{ id: 'website-team', title: t('一起安排周末', 'Plan the weekend together'), kind: 'group', agentIds: ['website-planner', 'website-researcher'], mode: 'demo', demo: true, createdAt: stamp, updatedAt: stamp, taskIds: [], messages: [{ id: 'website-team-note', role: 'assistant', agentId: 'website-planner', content: t('先选展览和出行时段，再安排路线、用餐与阅读时间。', 'Start with an exhibition and a time to go, then plan the route, a meal and time to read.'), createdAt: stamp, demo: true }] }],
    tasks: [task], artifacts, automations: [], projects: [], connectors: [], attachments: [], dailyActivities: [], defaultAgentAvatarStyle: 'notionists', settings,
    modelConnections: [{ ...settings, id: 'website-model', name: t('未连接的示例模型', 'Example model, not connected'), createdAt: stamp, updatedAt: stamp }], defaultConnectionId: 'website-model',
    computer: { id: 'local', name: t('官网演示', 'Website demonstration'), platform: 'demo', status: 'offline', workspace: '', codexAvailable: false },
  };
}
