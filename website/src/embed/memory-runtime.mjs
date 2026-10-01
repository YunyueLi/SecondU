import { personalContextFor, normalizeContextRequest } from '../../../server/personal-context.mjs';
import { taskTrace } from '../../../server/runtime-observation.mjs';
import { saveRoomReaction } from '../../../server/room-reactions.mjs';
import { previewMemoryImport, reviewMemoryImport, digitalTwinPackage, digitalTwinMarkdown } from '../../../server/memory-import.mjs';
import { artifactFormat, embeddedFile } from '../../../src/artifacts/format.mjs';

const clone = value => structuredClone(value);
const stamp = () => new Date().toISOString();
const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const pick = (value, fields) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, clone(value[key])]));
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const aliases = { 'agent-rooms': 'agentRooms', 'goal-lists': 'goalLists', 'model-connections': 'modelConnections', 'agent-resources': 'agentResources', 'im-connections': 'imConnections', 'im-outbox': 'imOutbox' };
const mutable = new Set(['sources', 'facts', 'people', 'relationships', 'events', 'goals', 'goalLists', 'agents', 'automations', 'projects', 'modelConnections']);
export class ExampleError extends Error {
  constructor(message, status = 400, code = 'invalid_example_change') { super(message); this.status = status; this.code = code; }
}
const fail = (message, status, code) => { throw new ExampleError(message, status, code); };
const string = (value, name, limit = 10000, required = true) => {
  if (typeof value !== 'string' || value.length > limit || required && !value.trim()) fail(`${name}: invalid value.`, 400);
  return value;
};
const unavailable = () => fail('官网示例保留本页修改。实际执行、连接账户和访问本机文件，请使用桌面版。', 403, 'showcase_read_only');
const secrets = value => Object.entries(value || {}).some(([key, item]) => /^(apiKey|token|clientSecret|password|secret)$/i.test(key) && item || item && typeof item === 'object' && secrets(item));

/** A disposable store of the canonical public examples. No network or disk APIs. */
export class ExampleRuntime {
  constructor(example) {
    this.example = clone(example); this.data = this.example.bootstrap;
    this.receipts = new Map(); this.extra = new Map(); this.feedbackRequests = new Map();
    for (const route of ['agent-resources', 'im-connections', 'im-outbox']) this.extra.set(aliases[route], clone(this.example.responses[`/${route}`] || []));
    this.appearance = clone(this.example.responses['/settings/appearance']);
  }
  list(collection) { return [...(this.data[collection] || this.extra.get(collection) || [])]; }
  get(collection, key) { return this.list(collection).find(item => item.id === key); }
  require(collection, key) { return this.get(collection, key) || fail('记录不存在。', 404, 'not_found'); }
  put(collection, value) {
    const rows = this.list(collection), at = rows.findIndex(item => item.id === value.id);
    if (at >= 0) rows[at] = value; else rows.push(value);
    if (Array.isArray(this.data[collection])) this.data[collection] = rows; else this.extra.set(collection, rows);
    return value;
  }
  delete(collection, key) {
    const rows = this.list(collection).filter(value => value.id !== key);
    if (Array.isArray(this.data[collection])) this.data[collection] = rows; else this.extra.set(collection, rows);
  }
  meta(key) { return this.data[key]; }
  transaction(fn) {
    const data = clone(this.data), extra = clone(this.extra);
    try { return fn(); }
    catch (error) { this.data = data; this.example.bootstrap = data; this.extra = extra; throw error; }
  }
  refs(value, collection) {
    if (!Array.isArray(value) || value.length > 200 || value.some(key => typeof key !== 'string')) fail('关联记录无效。');
    const keys = [...new Set(value)]; keys.forEach(key => this.require(collection, key)); return keys;
  }
  chooseChat() {
    return this.data.tasks.find(task => !task.roomId && task.artifactIds.length && !task.archived)?.id || this.data.tasks[0]?.id;
  }
  response(pathname, method = 'GET', body = {}) {
    const url = new URL(pathname, 'https://website.example');
    if (url.origin !== 'https://website.example' || !pathname.startsWith('/') || pathname.startsWith('//')) fail('Invalid example route.');
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 4 * 1024 * 1024) fail('Invalid example request.');
    if (secrets(body)) unavailable();
    const [resource, key, action] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const collection = aliases[resource] || resource;
    if (method === 'GET') {
      if (resource === 'digital-twin' && key === 'export') {
        const data = digitalTwinPackage(this);
        return url.searchParams.get('format') === 'markdown' ? digitalTwinMarkdown(data) : data;
      }
      if (resource === 'bootstrap') { this.refreshActivity(); return clone(this.data); }
      if (resource === 'daily-activity') { this.refreshActivity(); return clone(this.data.dailyActivities); }
      if (resource === 'model-connections' && !key) return clone({ connections: this.data.modelConnections, defaultConnectionId: this.data.defaultConnectionId });
      if (resource === 'settings' && key === 'execution') return clone(this.data.executionSettings);
      if (resource === 'settings' && key === 'appearance') return clone(this.appearance);
      if (resource === 'spaces') return { spaces: [{ id: this.example.space, name: this.data.profile.name, exists: true, kind: 'fictional' }] };
      if (resource === 'tasks' && action === 'context') return clone(personalContextFor(this, this.require('tasks', key)));
      if (resource === 'tasks' && action === 'trace') return clone(taskTrace(this.require('tasks', key)));
      if (resource === 'tasks' && action === 'feedback') return this.list('taskFeedback').filter(record => record.taskId === key).map(record => this.feedbackRecord(record.id));
      if (resource === 'task-feedback' && key) return this.feedbackRecord(key);
      if (resource === 'projects' && action === 'files') {
        this.require('projects', key);
        const relative = url.searchParams.get('path') || '';
        if (relative.split('/').some(part => part === '.' || part === '..') || relative.startsWith('/') || relative.includes('\\')) fail('Invalid project path.');
        const value = this.example.responses[`/projects/${key}/files?path=${encodeURIComponent(relative)}`];
        if (!value) fail('示例目录不存在。', 404);
        const listing = clone(value);
        for (const file of listing.entries) {
          const artifact = this.data.artifacts.find(item => item.name === file.path && this.get('tasks', item.taskId)?.projectId === key);
          if (artifact) { file.size = new TextEncoder().encode(artifact.content).length; file.modifiedAt = artifact.updatedAt; }
        }
        return listing;
      }
      if (['agent-resources', 'im-connections', 'im-outbox'].includes(resource) && !key) return clone(this.list(collection).filter(item => !url.searchParams.get('agentId') || item.agentId === url.searchParams.get('agentId')));
      if (resource === 'computers' && !key) return clone({ ...this.example.responses['/computers'], connections: this.data.modelConnections });
      const recorded = url.pathname + (url.search ? '?' + [...url.searchParams].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&') : '');
      if (Object.hasOwn(this.example.responses, recorded)) return clone(this.example.responses[recorded]);
      if (!action && Array.isArray(this.data[collection])) return clone(key ? this.require(collection, key) : this.list(collection));
      fail('此示例记录不存在。', 404, 'not_found');
    }
    if (resource === 'imports' && key === 'memory' && method === 'POST') {
      if (action === 'preview') return clone(previewMemoryImport(this, body));
      if (action === 'review') return clone(reviewMemoryImport(this, body));
    }
    if (body.mode === 'live' || resource === 'projects' && key === 'choose-directory' || ['computers', 'delegations', 'model-catalogue', 'imports', 'attachments', 'avatars', 'im-setup'].includes(resource) || ['run', 'message', 'messages', 'approval', 'test', 'probe', 'send', 'prepare', 'oauth'].includes(action)) unavailable();
    if (resource === 'spaces') unavailable();
    if (resource === 'settings' && key === 'appearance' && method === 'PUT') { this.appearance = { ...this.appearance, ...clone(body) }; return clone(this.appearance); }
    if (resource === 'settings' && key === 'execution' && method === 'PUT') {
      if (!['ask', 'auto', 'full'].includes(body.approvalMode)) fail('Invalid permission setting.');
      this.data.executionSettings = { approvalMode: body.approvalMode }; return clone(this.data.executionSettings);
    }
    if (resource === 'profile' && method === 'PUT') {
      const patch = pick(body, ['name', 'description']);
      if (patch.name !== undefined) string(patch.name, 'name', 200);
      if (body.avatarDataUrl !== undefined || body.clearAvatar) unavailable();
      Object.assign(this.data.profile, patch); return clone(this.data.profile);
    }
    if (resource === 'tasks' && action === 'revise' && method === 'POST') return this.revise(key, body);
    if (resource === 'tasks' && action === 'feedback' && method === 'POST') return this.saveFeedback(key, body);
    if (resource === 'tasks' && action === 'reaction' && method === 'PUT') {
      const task = clone(this.require('tasks', key)), message = task.messages.find(item => item.id === body.messageId && item.role === 'assistant');
      if (!message || !['up', 'down', null].includes(body.value)) fail('答复评价无效。');
      if (body.value === null) delete message.reaction;
      else message.reaction = { ...pick(body, ['value', 'reason', 'comment']), updatedAt: stamp() };
      this.put('tasks', task); return clone(message);
    }
    if (resource === 'agent-rooms' && action === 'reactions' && method === 'PUT') return clone(saveRoomReaction(this, key, body));
    if (resource === 'agent-rooms' && !action && ['POST', 'PUT'].includes(method)) return this.saveRoom(key, body);
    if (resource === 'tasks' && !action && method === 'POST' && !key) return this.createTask(body);
    if (resource === 'tasks' && !action && method === 'PUT' && key) {
      const task = clone(this.require('tasks', key));
      if (['running', 'awaiting_approval'].includes(task.status)) fail('请先停止任务。', 409);
      Object.assign(task, pick(body, ['title', 'archived', 'mode', 'connectionId', 'digitalTwinEnabled', 'approvalMode']));
      if (body.contextFactIds) task.contextFactIds = this.refs(body.contextFactIds, 'facts');
      if (body.agentIds) task.agentIds = this.refs(body.agentIds, 'agents');
      if (body.contextRequest) task.contextRequest = normalizeContextRequest(body.contextRequest);
      if (body.connectorIds) task.connectorIds = this.refs(body.connectorIds, 'connectors');
      task.updatedAt = stamp(); return clone(this.put('tasks', task));
    }
    if (resource === 'tasks' && action === 'cancel' && method === 'POST') {
      const task = this.require('tasks', key); if (task.status === 'queued') { task.status = 'cancelled'; task.updatedAt = stamp(); }
      return clone(task);
    }
    if (resource === 'artifacts' && key && !action && method === 'PUT') {
      const old = this.require('artifacts', key);
      if (!artifactFormat(old).editable) fail('此文件只读。', 409, 'binary_artifact_read_only');
      if (body.baseVersion !== old.version) fail('文件已有更新，请刷新后再保存。', 409, 'version_conflict');
      string(body.content, 'content', 1024 * 1024, false);
      const next = { ...old, content: body.content, version: old.version + 1, updatedAt: stamp(), origin: { kind: 'user' }, classification: 'artifact' };
      next.versions = [...old.versions, { version: next.version, content: next.content, createdAt: next.updatedAt, author: '用户' }];
      this.put('artifacts', next); return clone(next);
    }
    if (resource === 'agents' && key === 'avatar-style' && method === 'PUT') {
      const selected = body.agentIds ? this.refs(body.agentIds, 'agents') : this.data.agents.map(agent => agent.id);
      for (const agentId of selected) this.require('agents', agentId).avatarStyle = body.avatarStyle;
      this.data.defaultAgentAvatarStyle = body.avatarStyle; return { updated: selected.length, agentIds: selected, style: body.avatarStyle };
    }
    if (resource === 'model-connections' && action === 'default' && method === 'POST') {
      const connection = this.require('modelConnections', key); this.data.defaultConnectionId = key; this.data.settings = clone(connection);
      return { connection: clone(connection), defaultConnectionId: key };
    }
    if (mutable.has(collection) && !action && ['POST', 'PUT'].includes(method)) return this.saveEntity(collection, key, body);
    if (mutable.has(collection) && key && !action && method === 'DELETE') return this.remove(collection, key);
    unavailable();
  }
  createTask(body) {
    const prompt = string(body.prompt, 'prompt', 200000), at = stamp();
    const task = { ...pick(body, ['title', 'projectId', 'connectionId', 'digitalTwinEnabled', 'approvalMode']), id: id('task'), title: body.title || prompt.slice(0, 80), prompt, mode: 'demo', status: 'queued', interaction: 'chat', createdAt: at, updatedAt: at, agentIds: this.refs(body.agentIds || [], 'agents'), contextFactIds: this.refs(body.contextFactIds || [], 'facts'), messages: [{ id: id('message'), role: 'user', content: prompt, createdAt: at }], events: [], artifactIds: [], approvals: [] };
    this.put('tasks', task); return clone(task);
  }
  refreshActivity() {
    const notes = (this.data.dailyActivities || []).filter(item => item.kind !== 'task' && item.kind !== 'room');
    const tasks = this.data.tasks.filter(task => !task.archived).map(task => {
      const room = task.roomId && this.get('agentRooms', task.roomId);
      const finished = [...task.events].reverse().find(event => ['completed', 'failed', 'cancelled', 'interrupted'].includes(event.type));
      return { id: `activity-task-${task.id}`, kind: room ? 'room' : 'task', title: task.title, summary: (task.messages.filter(message => message.role === 'user').at(-1)?.content || task.prompt).slice(0, 1000), startAt: task.createdAt, ...(finished && !['running', 'queued', 'awaiting_approval', 'needs_input'].includes(task.status) ? { endAt: finished.createdAt } : {}), app: 'SecondU', status: task.status, taskId: task.id, ...(room ? { roomId: room.id, roomTitle: room.title } : {}), sourceIds: [], demo: true };
    });
    this.data.dailyActivities = [...tasks, ...notes].sort((a, b) => (b.startAt || b.date).localeCompare(a.startAt || a.date));
  }
  feedbackRecord(key) {
    const record = this.require('taskFeedback', key), fact = this.get('facts', record.factId);
    return clone({ ...record, factStatus: fact?.status || 'missing', factVersion: fact?.version || null });
  }
  saveFeedback(taskId, body) {
    string(body.requestId, 'requestId', 160);
    const receipt = `${taskId}:${body.requestId}`, fingerprint = JSON.stringify(body), prior = this.feedbackRequests.get(receipt);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('本次反馈已保存，请刷新后再修改。', 409, 'feedback_request_conflict');
      return prior.promise.then(key => this.feedbackRecord(key));
    }
    const task = this.require('tasks', taskId);
    if (['running', 'queued', 'awaiting_approval'].includes(task.status)) fail('请等本轮结束后再记录反馈。', 409, 'feedback_task_active');
    string(body.feedback, 'feedback', 30000); string(body.statement, 'statement', 10000);
    const kind = body.kind || 'preference';
    if (!['preference', 'value', 'capability', 'constraint', 'identity', 'decision'].includes(kind)) fail('理解类型无效。');
    const selected = body.messageId ? task.messages.find(message => message.id === body.messageId && message.role === 'assistant') : [...task.messages].reverse().find(message => message.role === 'assistant');
    if (body.messageId && !selected || !selected && !body.artifact) fail('请选择当前任务的答复或成果。', 400, 'feedback_message_scope');
    const artifactSnapshot = async ref => {
      const artifact = this.require('artifacts', ref.id), revision = artifact.versions.find(item => item.version === ref.version);
      if (artifact.taskId !== taskId || !revision) fail('请选择当前任务中的成果版本。', 400, 'feedback_artifact_scope');
      return { id: artifact.id, name: artifact.name, version: revision.version, content: revision.content, sha256: await digest(revision.content), createdAt: revision.createdAt, author: revision.author };
    };
    const promise = (async () => {
      const at = stamp(), context = personalContextFor(this, task), scope = body.scope || { domain: context.domain, purpose: context.purpose };
      if (!['personal', 'project', 'any'].includes(scope.domain) || scope.projectId && (scope.projectId !== task.projectId || scope.domain !== 'project')) fail('反馈适用范围无效。', 400, 'invalid_feedback_scope');
      const original = {};
      if (selected) original.message = { ...pick(selected, ['id', 'role', 'content', 'createdAt', 'agentId']), sha256: await digest(selected.content) };
      if (body.artifact) original.artifact = await artifactSnapshot(body.artifact);
      const record = { schema: 'secondu.task-feedback.v1', id: id('feedback'), taskId, requestId: body.requestId, createdAt: at, context: { taskTitle: task.title, ...pick(task, ['projectId']), userMessage: clone(task.messages.filter(message => message.role === 'user').at(-1)), personalContext: { status: 'unavailable' }, facts: { status: 'unavailable' }, evidence: { status: 'unavailable' } }, original, correction: { text: body.feedback, statement: body.statement, kind, ...pick(body, ['preferenceDomain']) }, scope };
      for (const [field, type] of [['personalContext', 'personal_context'], ['facts', 'context'], ['evidence', 'evidence']]) {
        const event = [...task.events].reverse().find(event => event.type === type && (!selected || event.createdAt <= selected.createdAt));
        if (event) try { record.context[field] = { status: 'recorded', eventId: event.id, recordedAt: event.createdAt, value: JSON.parse(event.detail) }; } catch { /* Keep missing historical context explicit. */ }
      }
      if (body.adoption) {
        if (body.adoption.confirmed !== true || !!body.adoption.text === !!body.adoption.artifact) fail('请明确确认采纳内容。', 400, 'invalid_feedback_adoption');
        record.adoption = { confirmedBy: 'user', recordedAt: at, ...(body.adoption.artifact ? { artifact: await artifactSnapshot(body.adoption.artifact) } : { text: string(body.adoption.text, 'adoption', 30000) }) };
      }
      if (body.outcome) record.outcome = { status: 'user_reported', text: string(body.outcome.text, 'outcome', 10000), recordedAt: at };
      const source = this.saveEntity('sources', undefined, { title: `任务反馈：${task.title}`, kind: 'feedback', text: JSON.stringify(record, null, 2) });
      const fact = this.saveEntity('facts', undefined, { statement: body.statement, kind, status: 'candidate', sourceIds: [source.id], reason: '由任务反馈保存，等待本人确认。', ...pick(body, ['preferenceDomain']) });
      record.sourceId = source.id; record.factId = fact.id; this.put('taskFeedback', record); return record.id;
    })();
    this.feedbackRequests.set(receipt, { fingerprint, promise });
    return promise.then(key => this.feedbackRecord(key), error => { this.feedbackRequests.delete(receipt); throw error; });
  }
  saveRoom(key, body) {
    const old = key ? this.require('agentRooms', key) : undefined;
    const active = old?.activeTaskId && this.get('tasks', old.activeTaskId);
    const configurationOnly = Object.keys(body).length && Object.keys(body).every(key => ['mode', 'digitalTwinEnabled', 'connectorIds', 'approvalMode'].includes(key));
    if (active && ['running', 'awaiting_approval', 'queued', 'needs_input'].includes(active.status) && (!configurationOnly || !['queued', 'needs_input'].includes(active.status))) fail('会话还有待处理任务。', 409, 'room_busy');
    const value = { ...old, ...clone(body) }, members = this.refs(value.agentIds || [], 'agents');
    const kind = value.kind || (members.length > 1 ? 'group' : 'direct');
    if (kind === 'direct' ? members.length !== 1 : kind !== 'group' || members.length < 2 || members.length > 12) fail('请选择有效的会话成员。');
    if (value.team && (kind !== 'group' || !members.includes(value.team.leadAgentId))) fail('负责人必须来自当前成员。', 400, 'invalid_team_lead');
    const next = { ...pick(value, ['title', 'projectId', 'digitalTwinEnabled', 'connectorIds', 'approvalMode', 'archived', 'forkedFrom']), id: old?.id || id('room'), kind, agentIds: members, mode: 'demo', demo: true, createdAt: old?.createdAt || stamp(), updatedAt: stamp(), messages: old?.messages || [], taskIds: old?.taskIds || [] };
    next.title ||= members.map(member => this.require('agents', member).name).join('、');
    if (value.team) next.team = { leadAgentId: value.team.leadAgentId };
    if (old?.activeTaskId) next.activeTaskId = old.activeTaskId;
    if (next.projectId) this.require('projects', next.projectId); else delete next.projectId;
    return clone(this.put('agentRooms', next));
  }
  revise(taskId, body) {
    string(body.requestId, 'requestId', 100); string(body.content, 'content', 200000);
    if (body.run !== false) unavailable();
    const receiptKey = `${taskId}:${body.requestId}`, fingerprint = JSON.stringify(pick(body, ['messageId', 'content', 'run']));
    const previous = this.receipts.get(receiptKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('此请求已用于其他内容。', 409, 'revision_request_conflict');
      return { ...clone(previous.result), reused: true };
    }
    const original = this.require('tasks', taskId);
    if (['running', 'awaiting_approval'].includes(original.status)) fail('请先停止当前执行。', 409, 'revision_task_active');
    const index = original.messages.findIndex(message => message.id === body.messageId && message.role === 'user');
    if (index < 0) fail('原消息不存在。', 400, 'revision_message_scope');
    const at = stamp(), edited = { ...pick(original.messages[index], ['attachmentIds', 'recipientIds', 'replyToMessageId']), id: id('message'), role: 'user', content: body.content, createdAt: at };
    const task = { ...pick(original, ['title', 'projectId', 'connectionId', 'agentIds', 'contextFactIds', 'digitalTwinEnabled', 'connectorIds', 'contextRequest', 'team', 'interaction', 'approvalMode']), id: id('task'), mode: 'demo', status: 'queued', prompt: original.messages.slice(0, index).find(message => message.role === 'user')?.content || body.content, messages: [...clone(original.messages.slice(0, index)), edited], events: [], artifactIds: [], approvals: [], createdAt: at, updatedAt: at, forkedFrom: { taskId, messageId: body.messageId } };
    let room;
    Object.assign(task, pick(original, ['roomContext', 'replyContext']));
    if (original.roomId) {
      const source = this.require('agentRooms', original.roomId);
      const active = source.activeTaskId && this.get('tasks', source.activeTaskId);
      if (active && ['running', 'awaiting_approval'].includes(active.status)) fail('会话仍在执行，请先停止。', 409, 'revision_room_active');
      const cut = source.messages.findIndex(message => message.taskId === taskId && message.taskMessageId === body.messageId);
      if (cut < 0) fail('会话缺少原消息。', 409, 'revision_room_message_missing');
      let roster = original.agentIds;
      try { const recorded = JSON.parse(original.events.find(event => event.type === 'room')?.detail || '{}'); if (Array.isArray(recorded.agentIds) && recorded.agentIds.length && recorded.agentIds.every(key => this.get('agents', key))) roster = recorded.agentIds; } catch { /* Legacy examples may predate roster snapshots. */ }
      if (!roster.length) roster = source.agentIds;
      room = { ...pick(source, ['title']), ...pick(original, ['mode', 'projectId', 'digitalTwinEnabled', 'connectorIds', 'team', 'approvalMode']), kind: roster.length > 1 ? 'group' : 'direct', agentIds: [...roster], id: id('room'), demo: true, createdAt: at, updatedAt: at, messages: clone(source.messages.slice(0, cut)), taskIds: [], forkedFrom: { roomId: source.id, messageId: source.messages[cut].id } };
      for (const message of room.messages) if (message.taskId === taskId) message.taskId = task.id;
      room.messages.push({ ...edited, id: `room-${edited.id}`, taskId: task.id, taskMessageId: edited.id, demo: true });
      room.taskIds = [...new Set(room.messages.map(message => message.taskId).filter(Boolean))]; room.activeTaskId = task.id; task.roomId = room.id;
      this.put('agentRooms', room);
    }
    this.put('tasks', task); original.revisionTaskIds = [...(original.revisionTaskIds || []), task.id];
    const result = { task, ...(room ? { room } : {}), reused: false };
    this.receipts.set(receiptKey, { fingerprint, result: clone(result) }); return clone(result);
  }
  saveEntity(collection, key, body) {
    const old = key ? this.require(collection, key) : undefined;
    if (collection === 'sources' && old) fail('来源原文不可覆盖。', 405, 'immutable_source');
    const next = { ...clone(old || {}), ...clone(body), id: old?.id || id(collection), updatedAt: stamp() };
    delete next.baseVersion; delete next.apiKey; delete next.clearKey;
    if (next.sourceIds) next.sourceIds = this.refs(next.sourceIds, 'sources');
    if (next.agentIds) next.agentIds = this.refs(next.agentIds, 'agents');
    if (collection === 'facts') {
      string(next.statement, 'statement');
      if (old && body.baseVersion !== old.version) fail('认知已有更新，请刷新。', 409, 'version_conflict');
      next.kind ||= 'preference'; next.status ||= 'candidate'; next.sourceIds ||= []; next.version = (old?.version || 0) + 1;
      next.history = [...(old?.history || []), { ...pick(next, ['version', 'kind', 'statement', 'status', 'sourceIds', 'preferenceDomain']), reason: body.reason || '本页编辑', recordedAt: next.updatedAt }];
    }
    if (collection === 'goals') { string(next.title, 'title', 300); next.description ||= ''; next.status ||= 'active'; next.listId ||= 'goal-list-inbox'; this.require('goalLists', next.listId); next.sourceIds ||= []; next.flagged ||= false; if (next.status === 'done') next.completedAt = next.updatedAt; }
    if (collection === 'goalLists') { string(next.name, 'name', 100); next.color ||= 'blue'; }
    if (collection === 'people') { string(next.name, 'name', 200); next.role ||= ''; next.description ||= ''; next.sourceIds ||= []; }
    if (collection === 'relationships') { this.require('people', next.from); this.require('people', next.to); if (next.from === next.to) fail('请选择不同的人物。'); string(next.label, 'label', 200); }
    if (collection === 'agents') { string(next.name, 'name', 200); next.role ||= ''; next.instructions ||= ''; next.avatarStyle ||= this.data.defaultAgentAvatarStyle; if (next.connectionId) this.require('modelConnections', next.connectionId); }
    if (collection === 'sources') { string(next.title, 'title', 300); string(next.text, 'text', 200000); next.kind ||= 'note'; next.demo = true; }
    if (collection === 'automations') { if (body.enabled === true) unavailable(); string(next.title, 'title', 300); string(next.prompt, 'prompt', 30000); next.enabled = false; next.mode = 'demo'; next.agentIds ||= []; }
    if (collection === 'projects') { if (!old || body.path && body.path !== old.path || body.kind && body.kind !== old.kind) unavailable(); string(next.name, 'name', 100); }
    if (collection === 'modelConnections') { next.hasKey = false; next.revision = (old?.revision || 0) + 1; if (!old) next.name ||= next.model; if (!next.model || !next.provider || !next.baseUrl) fail('模型配置不完整。'); }
    next.createdAt ||= stamp(); this.put(collection, next);
    if (collection === 'modelConnections' && next.id === this.data.defaultConnectionId) this.data.settings = clone(next);
    return clone(next);
  }
  remove(collection, key) {
    this.require(collection, key);
    if (collection === 'projects' || collection === 'goalLists' && key === 'goal-list-inbox' || collection === 'people' && key === this.data.profile.selfPersonId || collection === 'modelConnections' && key === this.data.defaultConnectionId) fail('这条记录需要保留。', 409, 'record_in_use');
    if (['sources', 'facts', 'agents', 'people', 'goalLists', 'modelConnections'].includes(collection)) {
      const fields = { sources: ['sourceIds'], facts: ['contextFactIds'], agents: ['agentIds'], people: ['personIds', 'from', 'to'], goalLists: ['listId'], modelConnections: ['connectionId'] }[collection];
      if (Object.values(this.data).some(rows => Array.isArray(rows) && rows.some(item => fields.some(field => item[field] === key || Array.isArray(item[field]) && item[field].includes(key))))) fail('记录仍被引用。', 409, 'record_in_use');
    }
    this.data[collection] = this.list(collection).filter(item => item.id !== key); return { deleted: true };
  }
  download(artifactId, version) {
    const artifact = this.require('artifacts', artifactId);
    if (!Number.isSafeInteger(version) || version < 1) fail('版本无效。', 400, 'invalid_artifact_version');
    const selected = artifact.versions.find(item => item.version === version);
    if (!selected) fail('版本不存在。', 404, 'artifact_version_missing');
    const format = artifactFormat(artifact), mime = selected.mime || artifact.mime || format.mime;
    const bytes = selected.encoding === 'data-url' || artifact.encoding === 'data-url' ? embeddedFile(selected.content, mime) : new TextEncoder().encode(selected.content);
    if (!bytes) fail('文件原始内容不可用。', 409, 'artifact_original_unavailable');
    return { name: artifact.name, mime, bytes, version };
  }
}
