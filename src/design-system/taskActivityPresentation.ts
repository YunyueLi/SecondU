import type { ActivityActionStatus, ActivityElapsed, TaskActivityModel } from './taskActivityModel';
import type { TaskEvent, TaskEventActivity } from '../../shared/contracts';
import { activityEventType } from './taskActivityEvents.ts';

export interface ActivityLabel { zh: string; en: string }

/** The task state always takes precedence over a stale plan or tool record. */
export function activityStatusLabel(model: TaskActivityModel): ActivityLabel {
  switch (model.status) {
    case 'failed': return {zh:'本轮未完成', en:'This run failed'};
    case 'cancelled': return {zh:'已停止', en:'Stopped'};
    case 'interrupted': return {zh:'执行已中断', en:'Run interrupted'};
    case 'completed': return {zh:'本轮已完成', en:'Turn completed'};
  }
  if (model.remote?.unconfirmed) {
    if (model.remote.dispatch !== 'submitted') return {zh:'派发结果待确认', en:'Dispatch not confirmed'};
    return model.remote.observation === 'disconnected'
      ? {zh:'暂时无法联系执行电脑', en:'Unable to reach the execution computer'}
      : {zh:'等待执行电脑确认', en:'Awaiting confirmation from the execution computer'};
  }
  switch (model.status) {
    case 'queued': return {zh:'等待开始', en:'Waiting to start'};
    case 'awaiting_approval': return {zh:'等待批准', en:'Waiting for approval'};
    case 'needs_input': return {zh:'需要补充信息', en:'More information needed'};
  }
  if (model.stopping) return {zh:'正在停止', en:'Stopping'};
  if (model.review?.status === 'running') return {zh:'正在审查操作', en:'Reviewing an operation'};
  const active = model.activeActions.filter(action => action.status === 'running');
  if (active.length > 1) return {zh:`正在执行 ${active.length} 项操作`, en:`Running ${active.length} operations`};
  if (active.length) {
    switch (active[0].kind) {
      case 'command': return {zh:'正在执行命令', en:'Running a command'};
      case 'file_change': return {zh:'正在修改文件', en:'Editing files'};
      case 'web_search': return {zh:'正在检索网页', en:'Searching the web'};
      case 'connector': return {zh:'正在使用连接的应用', en:'Using a connected app'};
      default: return {zh:'正在使用工具', en:'Using a tool'};
    }
  }
  switch (model.review?.status) {
    case 'rejected': return {zh:'上次操作未获批准', en:'The last operation was not approved'};
    case 'failed': return {zh:'上次操作审查未完成', en:'The last operation review did not finish'};
    case 'cancelled': return {zh:'上次操作审查已停止', en:'The last operation review was stopped'};
  }
  const current = model.plan?.steps.find(step => step.status === 'running')?.text.trim();
  if (current && current.length <= 64 && !/[\r\n]/.test(current)) return {zh:current, en:current};
  if (model.collaborators.some(person => person.status === 'running')) return {zh:'正在协作处理', en:'Working with other agents'};
  return {zh:'正在处理', en:'Working'};
}

export function activityActionStatusLabel(status: ActivityActionStatus): ActivityLabel {
  return {
    running: {zh:'已开始', en:'Started'},
    completed: {zh:'已完成', en:'Completed'},
    failed: {zh:'操作未成功', en:'Operation failed'},
    rejected: {zh:'未获批准', en:'Not approved'},
    unknown: {zh:'操作记录', en:'Operation record'},
  }[status];
}

const actionEventLabels: Partial<Record<TaskEventActivity['kind'], Record<TaskEventActivity['phase'], ActivityLabel>>> = {
  command: {
    running:{zh:'已开始执行命令',en:'Command started'},
    completed:{zh:'命令已完成',en:'Command completed'},
    failed:{zh:'命令执行未成功',en:'Command failed'},
    rejected:{zh:'命令执行被拒绝',en:'Command declined'},
  },
  file_change: {
    running:{zh:'已开始修改文件',en:'File changes started'},
    completed:{zh:'文件修改已完成',en:'File changes completed'},
    failed:{zh:'文件修改未成功',en:'File changes failed'},
    rejected:{zh:'文件修改被拒绝',en:'File changes declined'},
  },
  web_search: {
    running:{zh:'已开始检索网页',en:'Web search started'},
    completed:{zh:'网页检索已完成',en:'Web search completed'},
    failed:{zh:'网页检索未成功',en:'Web search failed'},
    rejected:{zh:'网页检索被拒绝',en:'Web search declined'},
  },
  tool: {
    running:{zh:'已开始调用工具',en:'Tool call started'},
    completed:{zh:'工具调用已完成',en:'Tool call completed'},
    failed:{zh:'工具调用未成功',en:'Tool call failed'},
    rejected:{zh:'工具调用被拒绝',en:'Tool call declined'},
  },
  connector: {
    running:{zh:'已开始使用连接应用',en:'App operation started'},
    completed:{zh:'应用操作已完成',en:'App operation completed'},
    failed:{zh:'应用操作未成功',en:'App operation failed'},
    rejected:{zh:'应用操作被拒绝',en:'App operation declined'},
  },
};
const lifecycleEventLabels: Record<string, ActivityLabel> = {
  started:{zh:'本轮已开始',en:'Turn started'},
  completed:{zh:'本轮已完成',en:'Turn completed'},
  failed:{zh:'本轮未完成',en:'This run failed'},
  interrupted:{zh:'执行已中断',en:'Run interrupted'},
  cancelled:{zh:'执行已停止',en:'Run stopped'},
  cancel_requested:{zh:'已请求停止',en:'Stop requested'},
  needs_input:{zh:'需要补充信息',en:'More information needed'},
  configuration_required:{zh:'需要完成配置',en:'Configuration needed'},
  approval_requested:{zh:'等待批准',en:'Waiting for approval'},
  'runtime.approval':{zh:'等待批准',en:'Waiting for approval'},
  'runtime.approval_rejected':{zh:'扩大权限的请求已拒绝',en:'Broader permissions declined'},
  write_rejected:{zh:'写入未获批准',en:'Write not approved'},
  'runtime.unsupported':{zh:'当前环境不支持该操作',en:'Operation unsupported in this environment'},
  'team.worker_started':{zh:'协作任务已开始',en:'Assigned task started'},
  'team.worker_finished':{zh:'协作任务已返回结果',en:'Assigned task returned a result'},
  'runtime.collaboration':{zh:'协作状态已更新',en:'Collaboration updated'},
  'runtime.subagent_activity':{zh:'子任务状态已更新',en:'Subtask status updated'},
};
const reviewEventLabels: Record<string, ActivityLabel> = {
  inProgress:{zh:'操作审查已开始',en:'Operation review started'},
  approved:{zh:'操作已获批准',en:'Operation approved'},
  denied:{zh:'操作未获批准',en:'Operation not approved'},
  timedOut:{zh:'操作审查已超时',en:'Operation review timed out'},
  aborted:{zh:'操作审查已停止',en:'Operation review stopped'},
};

/** Translate only structured lifecycle facts; never infer an outcome from prose. */
export function activityEventLabel(event: TaskEvent): ActivityLabel {
  const type = activityEventType(event.type);
  if (['runtime.plan','runtime.progress','progress','runtime.reasoning_summary'].includes(type)) return {zh:event.label,en:event.label};
  if (type === 'runtime.auto_review') {
    try {
      const status = JSON.parse(event.detail || '')?.status;
      if (typeof status === 'string' && Object.hasOwn(reviewEventLabels,status)) return reviewEventLabels[status];
    } catch { /* Unknown historical review records retain their original label. */ }
    return {zh:event.label,en:event.label};
  }
  const action = event.activity && actionEventLabels[event.activity.kind]?.[event.activity.phase];
  if (action) return action;
  if (type === 'runtime.message' && event.activity?.kind === 'message') {
    if (event.activity.messagePhase === 'commentary') return {zh:'工作进展',en:'Work update'};
    if (event.activity.messagePhase === 'final_answer') return {zh:'答复已生成',en:'Reply generated'};
  }
  return Object.hasOwn(lifecycleEventLabels,type) ? lifecycleEventLabels[type] : {zh:event.label,en:event.label};
}

/** This is elapsed wall time, including approval waits, never model latency. */
export function activityElapsedLabel(elapsed: ActivityElapsed): ActivityLabel | null {
  const milliseconds = elapsed.milliseconds;
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const seconds = Math.floor(milliseconds / 1000);
  if (!seconds) return {zh:'小于 1 秒', en:'<1s'};
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  const zh = [hours ? `${hours} 小时` : '', minutes ? `${minutes} 分` : '', rest ? `${rest} 秒` : ''].filter(Boolean).join(' ');
  const en = [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', rest ? `${rest}s` : ''].filter(Boolean).join(' ');
  return {zh, en};
}
