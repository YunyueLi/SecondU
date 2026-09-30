import { lstatSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const legacyCompletion = '请核对产物；模型返回不等于所有外部动作已验收。';
const digest = content => createHash('sha256').update(content).digest('hex');

// The old host wrote every live assistant response itself, with the Agent name
// as author and a distinct completion event. Names alone are never provenance.
export function legacyReplyProvenance(store, artifact) {
  if (artifact.origin || artifact.classification || artifact.version !== 1 || artifact.versions?.length !== 1) return;
  const version = artifact.versions[0];
  if (version.version !== 1 || version.content !== artifact.content || version.createdAt !== artifact.updatedAt || !version.author || ['用户','执行器','执行器（待验收）'].includes(version.author)) return;
  const task = store.get('tasks', artifact.taskId);
  if (!task || task.mode !== 'live' || task.status !== 'completed' || !task.artifactIds.includes(artifact.id)) return;
  const events = task.events;
  const completed = events.at(-1);
  if (completed?.type !== 'completed' || completed.detail !== legacyCompletion) return;
  // One unambiguous legacy run. Resumed/multiple-run histories stay unchanged.
  if (events.filter(event => event.type === 'started').length !== 1 || events.some(event => event.type === 'artifact_edited' || event.type === 'correction')) return;
  const agentEvents = events.filter(event => event.type === 'agent_completed');
  const matchingAgents = agentEvents.filter(event => event.label === `${version.author} 本轮已结束`);
  if (matchingAgents.length !== 1) return;
  const agentEvent = matchingAgents[0], index = agentEvents.indexOf(agentEvent);
  if (artifact.name !== `result-${index + 1}.md`) return;
  const messages = task.messages.filter(message => message.role === 'assistant' && message.agentId === agentEvent.agentId && message.content === artifact.content);
  if (messages.length !== 1 || !artifact.content) return;
  const message = messages[0];
  const saved = events.filter(event => event.type === 'artifact_saved' && event.label === `已保存 ${artifact.name}` && [`版本 1 · ${version.author}`, `版本 1，${version.author}`].includes(event.detail));
  if (saved.length !== 1) return;
  const save = saved[0], saveIndex = events.indexOf(save);
  if (saveIndex <= events.indexOf(agentEvents.at(-1)) || saveIndex >= events.length - 1 || message.createdAt > version.createdAt || version.createdAt > save.createdAt || save.createdAt > completed.createdAt) return;
  try {
    const file = store.artifactPath(artifact), stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || !readFileSync(file).equals(Buffer.from(artifact.content))) return;
  } catch { return; }
  return { kind: 'legacy_reply', messageId: message.id, sha256: digest(artifact.content), eventIds: [agentEvent.id, save.id, completed.id] };
}

export function applyLegacyReplyClassification(store, at) {
  // Decide the entire batch before adding audit events so multi-Agent runs use
  // the same immutable legacy evidence. Never write or remove workspace files.
  const changes = store.list('artifacts').map(artifact => ({artifact, origin: legacyReplyProvenance(store, artifact)})).filter(item => item.origin);
  if (!changes.length) return 0;
  store.transaction(() => {
    for (const {artifact, origin} of changes) {
      const provenance = {...origin, classifiedAt: at};
      store.put('artifacts', {...artifact, classification: 'reply_snapshot', origin: provenance});
      const task = store.require('tasks', artifact.taskId);
      task.events.push({id: `event-${randomUUID()}`, type: 'artifact_classified', label: '旧回复文件已归入对话记录', detail: JSON.stringify({artifactId: artifact.id, ...provenance}), createdAt: at});
      store.put('tasks', task);
    }
  });
  return changes.length;
}
