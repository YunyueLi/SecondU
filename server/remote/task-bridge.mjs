import { createTask, addEvent } from '../domain.mjs';
import { taskEventActivity } from '../task-event-activity.mjs';
import { HttpError } from '../store.mjs';

/** Mirrors confirmed remote snapshots into the local task list. It never starts
 * a process, reads personal context, approves an action or downloads a file. */
export class RemoteTaskBridge {
  constructor(store) { this.store = store; this.service = null; this.syncing = new Set(); }
  connect(service) {
    this.service = service;
    for (const computer of service.list().computers) for (const run of service.runs(computer.id).runs) this.sync(run);
  }
  sync(run) {
    if (!this.service || this.syncing.has(run.id)) return;
    this.syncing.add(run.id);
    try { return this.store.transaction(() => {
      let task = run.taskId ? this.store.get('tasks', run.taskId) : this.store.list('tasks').find(item => item.remoteExecution?.runId === run.id);
      if (task && task.remoteExecution?.runId !== run.id) throw new HttpError(409, '远端记录不能覆盖另一项任务。', 'remote_task_mismatch');
      if (!task) {
        // Remote runs keep their own one-action approval contract; a local default cannot widen it.
        task = createTask(this.store, { prompt: run.prompt, mode: 'live', approvalMode: 'ask', digitalTwinEnabled: false, connectorIds: [], agentIds: [], contextFactIds: [], connectionId: run.modelConnectionId, attachmentIds: [] });
        task.remoteExecution = { runId: run.id, computerId: run.computerId };
        addEvent(task, 'remote.created', '已创建远端任务', `执行电脑：${run.computer.name}`);
        this.store.put('tasks', task);
      }
      if (run.taskId !== task.id) this.service.attachTask(run.id, task.id);
      const previous = task.remoteExecution;
      task.remoteExecution = {
        runId: run.id, computerId: run.computerId, computerName: run.computer.name,
        status: run.status, dispatch: run.dispatch, observation: run.observation,
        cursor: run.cursor, fileCount: run.files.length, cancelRequested: run.cancelRequested,
      };
      // A disconnected observer cannot decide that a remote worker stopped.
      task.status = run.status === 'starting' ? 'queued' : run.status;
      task.updatedAt = run.updatedAt;
      if (run.error) task.error = run.error.message; else delete task.error;
      const eventIds = new Set(task.events.map(event => event.id));
      for (const event of run.events) {
        const id = `${run.id}-event-${event.sequence}`;
        if (!eventIds.has(id)) { const activity=taskEventActivity(event.activity);task.events.push({ id, type: `remote.${event.type}`, label: event.label, detail: event.detail, createdAt: event.at, ...(activity?{activity}:{}) }); }
      }
      if (previous?.observation?.status !== run.observation.status && run.observation.status === 'disconnected') addEvent(task, 'remote.observation_warning', '暂时无法联系执行电脑', '保留上次确认的任务状态；恢复连接只读取进展，不会重新执行。');
      // Remote approval state remains owned by the remote run; do not invent
      // a local decision when an approval disappears between observations.
      task.approvals = [];
      if (typeof run.result === 'string' && run.result.trim()) {
        const id = `${run.id}-result`, existing = task.messages.find(message => message.id === id);
        if (existing) existing.content = run.result;
        else task.messages.push({ id, role: 'assistant', content: run.result, createdAt: run.finishedAt || run.updatedAt });
      }
      this.store.put('tasks', task);
      return task;
    }); } finally { this.syncing.delete(run.id); }
  }
  runForTask(taskId) {
    const task = this.store.require('tasks', taskId);
    if (!task.remoteExecution) throw new HttpError(404, '这不是远端执行任务。', 'remote_task_missing');
    const run = this.service.getRun(task.remoteExecution.runId);
    if (run.taskId !== task.id) throw new HttpError(409, '远端任务关联不一致。', 'remote_task_mismatch');
    return run;
  }
  async control(taskId, operation, body = {}) {
    const run = this.runForTask(taskId);
    if (operation === 'approval' && !run.approvals.some(item => item.id === body.approvalId)) throw new HttpError(409, '这次审批已不再等待处理。', 'remote_approval_expired');
    const result = operation === 'poll' ? await this.service.poll(run.id, body) : await this.service.control(run.id, operation, body);
    this.sync(result.run);
    return this.store.require('tasks', taskId);
  }
}
