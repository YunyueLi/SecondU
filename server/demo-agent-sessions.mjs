import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import before from './fixtures/demo-agent-sessions-before-v1.json' with { type: 'json' };
import showcase from './fixtures/demo-showcase.json' with { type: 'json' };
import { demoAgentSessionBundles } from '../shared/demo-agent-sessions.mjs';

export const DEMO_AGENT_SESSIONS_MARKER = 'demo-agent-sessions-v1';
const showcaseMarker = 'demo-showcase-v1';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const recordHash = record => sha256(JSON.stringify(record));
const oldNotices = [
  '本地演示会话；连接模型后可继续处理自己的任务。',
  '这是虚构示例会话。发送后会运行明确标注的本地流程演示，结果与审批关联到真实本地任务；尚未运行模型。',
  '这是虚构示例会话。发送后运行本地流程演示，不调用模型；新任务及其结果会保存在本机。',
];

function untouchedRoom(current, baseline) {
  if (!current || !baseline) return false;
  if (!baseline.id.startsWith('demo-v2-room-')) return isDeepStrictEqual(current, baseline);
  // Only the seed's known installation timestamp is variable. Extra fields,
  // changed members, later timestamps and appended messages all protect a room.
  if (typeof current.createdAt !== 'string' || !Number.isFinite(Date.parse(current.createdAt))) return false;
  for (const content of oldNotices) {
    const expected = structuredClone(baseline);
    expected.createdAt = expected.updatedAt = current.createdAt;
    expected.messages[0].createdAt = current.createdAt;
    expected.messages[0].content = content;
    if (isDeepStrictEqual(current, expected)) return true;
  }
  return false;
}

function projectFolder(store, installation, projectId) {
  const expected = before.projects.find(project => project.id === projectId);
  const project = store.get('projects', projectId);
  if (!expected || !project || project.kind !== 'local' || project.archived
    || ![expected.description, showcase.projects.find(item => item.id === projectId)?.description].includes(project.description)
    || !path.isAbsolute(installation.root ?? '')) return;
  const root = installation.root, folder = path.join(root, expected.showcaseFolder);
  if (project.path !== folder || !existsSync(root) || !existsSync(folder)) return;
  if (lstatSync(root).isSymbolicLink() || lstatSync(folder).isSymbolicLink()
    || !lstatSync(folder).isDirectory() || realpathSync(root) !== root || realpathSync(folder) !== folder) return;
  return folder;
}

function fileIsAvailable(file, content) {
  if (!existsSync(file)) {
    // existsSync follows links, including dangling links; lstat closes that gap.
    try { lstatSync(file); return false; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return true;
  }
  const stat = lstatSync(file);
  return !stat.isSymbolicLink() && stat.isFile() && readFileSync(file, 'utf8') === content;
}

/** Add complete authored histories without replaying tasks or replacing user work. */
export function applyDemoAgentSessions(store) {
  const profile = store.get('meta', 'profile')?.value;
  if (profile?.demo !== true || profile.demoLocale === 'en' || store.get('meta', DEMO_AGENT_SESSIONS_MARKER)) return;
  const installed = store.get('meta', showcaseMarker)?.value;
  if (!installed) return;
  return store.transaction(() => {
    // Check after acquiring the write lock as well, so concurrent bootstraps are idempotent.
    if (store.get('meta', DEMO_AGENT_SESSIONS_MARKER)) return;
    const installation = structuredClone(store.get('meta', showcaseMarker).value);
    const report = { appliedAt: new Date().toISOString(), installed: [], preserved: [] };
    const ready = [];
    for (const bundle of demoAgentSessionBundles) {
      const preserve = reason => report.preserved.push({ roomId: bundle.room.id, reason });
      const baseline = before.agentRooms.find(room => room.id === bundle.room.id);
      const current = store.get('agentRooms', bundle.room.id);
      if (baseline ? !untouchedRoom(current, baseline) : !!current) { preserve(current ? 'room_changed' : 'room_removed'); continue; }
      if (store.get('tasks', bundle.task.id) || store.get('artifacts', bundle.artifact.id)) { preserve('record_collision'); continue; }
      if (!bundle.room.agentIds.every(id => {
        const agent = store.get('agents', id), expected = before.agents.find(item => item.id === id);
        return agent && expected && ['name', 'role', 'instructions'].every(field => agent[field] === expected[field]);
      })) { preserve('agent_changed_or_removed'); continue; }
      const folder = projectFolder(store, installation, bundle.task.projectId);
      if (!folder) { preserve('project_changed_or_removed'); continue; }
      const files = [
        { path: path.join(folder, bundle.artifact.name), content: bundle.artifact.content },
      ];
      if (!files.every(file => fileIsAvailable(file.path, file.content))) { preserve('file_changed'); continue; }
      ready.push({ bundle, files });
    }
    // Preflight all outputs before writing any. Existing files must match exactly;
    // exclusive creation preserves competing writes. If SQLite rolls back, exact
    // authored files may remain and are reused safely on the next bootstrap.
    for (const { files } of ready) for (const file of files) {
      if (!existsSync(file.path)) writeFileSync(file.path, file.content, { flag: 'wx', mode: 0o600 });
      else if (!fileIsAvailable(file.path, file.content)) throw new Error('An example output changed during installation; existing data was preserved.');
    }
    for (const { bundle } of ready) {
      const records = [];
      for (const [collection, value] of [['agentRooms', bundle.room], ['tasks', bundle.task], ['artifacts', bundle.artifact]]) {
        store.put(collection, value);
        const entry = { collection, id: value.id, sha256: recordHash(value) };
        const registered = installation.records.findIndex(item => item.collection === collection && item.id === value.id);
        if (registered === -1) installation.records.push(entry); else installation.records[registered] = entry;
        records.push(entry);
      }
      report.installed.push({ roomId: bundle.room.id, taskId: bundle.task.id, artifactId: bundle.artifact.id, records });
    }
    store.setMeta(showcaseMarker, installation);
    store.setMeta(DEMO_AGENT_SESSIONS_MARKER, report);
    return report;
  });
}
