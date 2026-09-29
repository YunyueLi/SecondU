// Fictional records only. These are product examples, never imported personal data.
export function createSeed(now = new Date().toISOString()) {
  const source = (id, title, text, kind = 'note') => ({ id, title, text, kind, createdAt: now, demo: true });
  const fact = (id, kind, statement, status, sourceIds) => ({ id, kind, statement, status, sourceIds, updatedAt: now, version: 1, history: [{ version: 1, kind, statement, status, sourceIds: [...sourceIds], reason: '虚构示例，用于体验认知与来源的联系', recordedAt: now }] });
  return {
    profile: { name: '林遥', description: '虚构示例人物 · 产品设计师，正在筹备社区声音展。所有人物和记录均为演示数据。', demo: true },
    sources: [
      source('source-exhibition', '声音展的第一份笔记（虚构示例）', '我叫林遥，是产品设计师。想在十月做一个小型社区声音展，让邻居分享日常听见的声音。希望先邀请六个人试做，用文字说明和短音频就好，预算控制在 2000 元以内。'),
      source('source-chat', '和许安讨论筹备（虚构对话）', '林遥：工作日晚上我只留半小时做筹备，周末可以多投入一些。\n许安：我可以帮你剪音频，但请提前三天发给我。\n林遥：好。先做一个小版本，别把所有想法都加进第一期。', 'conversation'),
      source('source-feedback', '一次明确的偏好修正（虚构示例）', '我喜欢简短、具体的建议。请先给今天能做的一步，再给完整计划。不要未经确认就替我联系邻居。', 'feedback'),
    ],
    facts: [
      fact('fact-clear', 'preference', '建议先给今天能做的一步，再给完整计划；语言简短、具体。', 'confirmed', ['source-feedback']),
      fact('fact-budget', 'constraint', '社区声音展的首期预算不超过 2000 元。', 'confirmed', ['source-exhibition']),
      fact('fact-time', 'constraint', '工作日晚上通常只留半小时用于展览筹备。', 'confirmed', ['source-chat']),
      fact('fact-consent', 'value', '联系邻居或发布他们的声音之前，需要先取得明确许可。', 'confirmed', ['source-feedback']),
      fact('fact-small', 'preference', '可能偏好先完成小版本，再逐步扩展。', 'inferred', ['source-chat']),
      fact('fact-identity', 'identity', '林遥是一名产品设计师，正在筹备社区声音展。', 'confirmed', ['source-exhibition']),
    ],
    people: [
      { id: 'person-self', name: '林遥', role: '我 · 虚构示例', description: '产品设计师，社区声音展发起人。', sourceIds: ['source-exhibition'] },
      { id: 'person-xuan', name: '许安', role: '朋友 / 音频协作者', description: '愿意协助剪辑，希望提前三天收到素材。', sourceIds: ['source-chat'] },
      { id: 'person-qiao', name: '乔宁', role: '社区空间伙伴', description: '虚构示例：协助确认展览空间和时间。', sourceIds: ['source-exhibition'] },
      { id: 'person-chen', name: '陈禾', role: '同事', description: '虚构示例：可以一起讨论视觉呈现。', sourceIds: ['source-exhibition'] },
    ],
    relationships: [
      { id: 'rel-xuan', from: 'person-self', to: 'person-xuan', label: '一起做声音展', description: '先明确素材交接日期，再安排剪辑。', sourceIds: ['source-chat'] },
      { id: 'rel-qiao', from: 'person-self', to: 'person-qiao', label: '空间协作', description: '场地仍待确认，不能把意向当成承诺。', sourceIds: ['source-exhibition'] },
      { id: 'rel-chen', from: 'person-self', to: 'person-chen', label: '设计交流', description: '可以请教，但未分配正式任务。', sourceIds: ['source-exhibition'] },
    ],
    events: [
      { id: 'event-idea', date: '2026-09-21', title: '写下声音展的想法', description: '虚构示例：先做六人参与的小版本。', category: '项目', personIds: ['person-self'], sourceIds: ['source-exhibition'] },
      { id: 'event-chat', date: '2026-09-25', title: '和许安讨论素材交接', description: '预留三天剪辑时间，不承诺未经确认的日期。', category: '关系', personIds: ['person-self', 'person-xuan'], sourceIds: ['source-chat'] },
      { id: 'event-review', date: '2026-09-28', title: '重新明确自己的节奏', description: '先做今天能做的一步，保留工作和休息时间。', category: '自我理解', personIds: ['person-self'], sourceIds: ['source-feedback'] },
    ],
    conversations: [{ id: 'conversation-xuan', title: '与许安聊声音展', personIds: ['person-self', 'person-xuan'], kind: 'direct', messages: [
      { id: 'msg-1', senderId: 'person-self', content: '工作日晚上我只留半小时做筹备，周末可以多投入一些。', time: '2026-09-25T11:00:00.000Z', sourceId: 'source-chat' },
      { id: 'msg-2', senderId: 'person-xuan', content: '我可以帮你剪音频，但请提前三天发给我。', time: '2026-09-25T11:01:00.000Z', sourceId: 'source-chat' },
      { id: 'msg-3', senderId: 'person-self', content: '好。先做一个小版本，别把所有想法都加进第一期。', time: '2026-09-25T11:02:00.000Z', sourceId: 'source-chat' },
    ] }],
    goals: [
      { id: 'goal-exhibition', title: '做一次六人参与的社区声音展', description: '先确认范围与许可，再收集少量声音。预算不超过 2000 元。', status: 'active', dueDate: '2026-10-25', sourceIds: ['source-exhibition'] },
      { id: 'goal-rest', title: '给工作和休息留下空间', description: '工作日晚上的筹备控制在半小时内，避免项目挤满生活。', status: 'active', sourceIds: ['source-chat'] },
    ],
    agents: [
      { id: 'agent-planner', name: '筹划伙伴', role: '把目标拆成可执行的小步', instructions: '先给今天能做的一步，再给短计划。尊重用户的时间、预算和许可；未确认的条件单独列出。', createdAt: now },
      { id: 'agent-reviewer', name: '复核伙伴', role: '检查证据、遗漏与边界', instructions: '检查计划是否符合选中的个人认知与证据。区分事实和推断，指出待确认项，不替用户作出对外承诺。', createdAt: now },
    ],
    tasks: [], artifacts: [], automations: [],
    settings: { provider: 'deepseek', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com/', api: 'responses', hasKey: false, reasoningEffort: 'low' },
  };
}
