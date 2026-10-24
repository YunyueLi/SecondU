export const proactiveExampleTaskId = 'embed-proactive-example';
export const proactiveExampleSourceId = 'embed-proactive-source';

/** Fictional read-only records, added only to the presentation's GET response. */
export function withProactiveExample(data) {
  const createdAt = '2026-10-01T09:00:00.000Z';
  const source = {
    id: proactiveExampleSourceId, title: '读书会活动安排（演示资料）',
    kind: 'document', demo: true, createdAt,
    text: '预置演示资料，不来自已连接的账号。\n\n周末读书会安排新增两项信息：场地确认时间为周五，报名截止时间为周四晚。原计划周末整理报名名单，需要提前准备。\n\n示例用户反馈：先核对已报名者，不向尚未回复的朋友发送消息。',
  };
  const origin = {kind: 'proactive', generator: 'application', suggestionId: 'embed-proactive-suggestion', sourceIds: [source.id]};
  const task = {
    id: proactiveExampleTaskId, title: '主动提醒与用户反馈（示例）', prompt: '',
    agentIds: [], contextFactIds: [], connectorIds: [], digitalTwinEnabled: true,
    mode: 'demo', status: 'completed', interaction: 'chat', createdAt, updatedAt: createdAt,
    artifactIds: [], approvals: [], events: [],
    messages: [
      {id: 'embed-proactive-notice', role: 'assistant', origin, createdAt,
        content: '**主动提醒示例**\n\n《读书会活动安排》新增了周五确认场地、周四晚截止报名两项信息。你原计划周末整理名单，现在需要提前核对。我已在这份演示中列出需要确认的事项：报名人数、场地容量与回复期限。\n\n[查看示例资料](#building/embed-proactive-source) · [查看连接方式](#settings/connectors)\n\n*本段使用预置演示资料；未连接真实服务，也未执行后台任务。*'},
      {id: 'embed-proactive-feedback', role: 'user', createdAt,
        content: '先核对已报名的人，尚未回复的朋友暂时不联系。'},
      {id: 'embed-proactive-response', role: 'assistant', origin, createdAt,
        content: '本次核对范围调整为已报名者，并补充场地容量与确认期限。这个选择仅用于本次活动，后续相似活动仍需结合当时安排判断。'},
    ],
  };
  return {
    ...data,
    tasks: [...(data.tasks || []).filter(item => item.id !== task.id), task],
    sources: [...(data.sources || []).filter(item => item.id !== source.id), source],
  };
}
