import stories from './demo-agent-session-stories.json' with { type: 'json' };

const notice = '这段会话和文件是编写的示例，可以查看和编辑；没有调用模型，也没有发送、购买或预订。';
const eventLabel = '已整理的示例';
const eventDetail = '会话及文件为预先编写的示例。';

/** Authored Chinese stories. The American example space has independent data. */
export const demoAgentSessionBundles = stories.map((story, index) => {
  const at = minute => new Date(Date.UTC(2026, 8, 30, 2, index * 10 + minute)).toISOString();
  const taskId = `demo-agent-session-task-${story.key}`;
  const artifactId = `demo-agent-session-artifact-${story.key}`;
  const projectId = `demo-showcase-project-${story.project}`;
  const messages = story.messages.map(([speaker, content], i) => ({
    id: `${taskId}-m${i}`, role: speaker === 'user' ? 'user' : 'assistant', content,
    ...(speaker === 'user' ? {} : { agentId: speaker }), createdAt: at(i + 1),
  }));
  const createdAt = at(0), updatedAt = at(messages.length + 1);
  const room = {
    id: story.roomId, title: story.title, kind: story.kind, agentIds: story.agents,
    projectId, mode: 'demo', digitalTwinEnabled: true, createdAt, updatedAt, demo: true,
    taskIds: [taskId], messages: [
      { id: `${story.roomId}-authored-notice`, role: 'system', content: notice, createdAt, demo: true },
      ...messages.map(message => ({ ...message, id: `${story.roomId}-${message.id}`, taskId, taskMessageId: message.id, demo: true })),
    ],
  };
  const task = {
    id: taskId, title: story.taskTitle, prompt: messages[0].content, projectId, roomId: room.id,
    agentIds: story.agents, contextFactIds: story.contextFactIds ?? [], digitalTwinEnabled: true, connectorIds: [],
    mode: 'demo', status: 'completed', interaction: 'task', createdAt, updatedAt, messages,
    events: [{ id: `${taskId}-record`, type: 'showcase.recorded', label: eventLabel, detail: eventDetail, createdAt: updatedAt }],
    artifactIds: [artifactId], approvals: [],
  };
  const artifact = {
    id: artifactId, taskId, name: story.file, type: 'markdown', classification: 'artifact',
    origin: { kind: 'demo' }, reviewStatus: 'ready', content: story.artifact, version: story.versions?.length ?? 1,
    versions: (story.versions ?? [{ content: story.artifact }]).map((version, i) => ({ version: i + 1, content: version.content, createdAt: updatedAt, author: 'SecondU' })), updatedAt,
  };
  return { key: story.key, room, task, artifact };
});
