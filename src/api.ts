import { t, getLocale } from './i18n';
import { apiUrl, currentSpace, ENGINEER_SPACE } from './space';
import { canonicalDemoValue } from '../shared/demo-localization.mjs';
export { apiUrl } from './space';

// Only known application messages are translated. Provider diagnostics and
// other unrecognized server text remain intact for troubleshooting.
const knownMessages: ReadonlyArray<readonly [string, string]> = [
  ["个人上下文设置无效。", "The personal context settings are invalid."],
  ["个人上下文范围、用途或预算无效。", "The personal context scope, purpose, or size limit is invalid."],
  ["请选择产物及明确版本。", "Choose an artifact and a specific version."],
  ["产物不属于本次任务。", "This artifact belongs to another task."],
  ["所选产物版本不存在，请重新选择。", "This artifact version is unavailable. Choose another version."],
  ["反馈适用范围无效。", "The feedback scope is invalid."],
  ["反馈适用范围或用途无效。", "The feedback scope or purpose is invalid."],
  ["反馈只能限定到本次任务所在项目。", "Feedback can only be scoped to the project used by this task."],
  ["反馈字段无效。", "The feedback contains invalid fields."],
  ["本次反馈请求已保存，请刷新后再修改。", "This feedback has already been saved. Refresh before making changes."],
  ["请等本轮结束或停止后再记录反馈。", "Wait for this turn to finish or stop it before saving feedback."],
  ["理解类型无效。", "The insight type is invalid."],
  ["只能关联本次任务的助手答复。", "Choose an assistant reply from this task."],
  ["请先选择已有答复或产物。", "Choose an existing reply or artifact first."],
  ["采纳内容需要你明确确认，并选择一份正文或产物版本。", "Confirm what you adopted and choose either text or an artifact version."],
  ["实际结果格式无效。", "The outcome format is invalid."],
  ["原答复或所选资料包含凭据信息，不能写入反馈记录。", "The original reply or selected material contains credentials and cannot be saved as feedback."],
  ["示例空间只用于查看和体验界面。请切换到真实空间开始任务。", "The example space is for browsing the interface. Switch to your personal space to start a task."],
  ["这是一条历史示例记录，仅供查看。请新建真实任务。", "This historical example is read only. Create a new live task."],
  ["示例空间只用于查看和体验界面，不能运行任务或连接真实账户。请切换到真实空间。", "The example space cannot run tasks or connect real accounts. Switch to your personal space."],
  ["真实空间只支持真实任务。", "Your personal space supports live tasks only."],
  ["历史示例记录仅供查看，不能转换为真实执行。请新建任务。", "Historical examples are read only and cannot be converted to live runs. Create a new task."],
  ["真实空间只支持真实会话。", "Your personal space supports live chats only."],
  ["历史示例会话仅供查看，请新建真实会话。", "Historical example chats are read only. Create a new live chat."],
  ["真实空间的自动化只支持真实任务。", "Automations in your personal space support live tasks only."],
  ["历史示例自动化仅供查看，请新建真实自动化。", "Historical example automations are read only. Create a new live automation."],
  ["反馈请求标识 无效或过长", "The feedback request ID is invalid or too long."],
  ["用户纠正 无效或过长", "Your feedback is invalid or too long."],
  ["以后使用的理解 无效或过长", "The insight for future tasks is invalid or too long."],
  ["原答复 无效或过长", "The original reply is invalid or too long."],
  ["产物正文 无效或过长", "The artifact content is invalid or too long."],
  ["采纳的内容 无效或过长", "The adopted content is invalid or too long."],
  ["实际结果 无效或过长", "The outcome is invalid or too long."],
  ['资料链接必须是有效的 HTTP(S) 地址', 'Source links must be valid HTTP(S) URLs.'],
  ['资料链接不能包含用户名或密码', 'Source links cannot contain a username or password.'],
  ['本机服务返回了无法读取的结果，请稍后重试。', 'The local service returned an unreadable response. Please try again.'],
  ['操作未完成，请重试。', 'The operation did not finish. Please try again.'],
  ['本机服务遇到错误，请检查运行日志。', 'The local service encountered an error. Check the application logs.'],
  ['服务正在停止', 'The service is shutting down.'],
  ['接口不存在', 'This endpoint is not available.'],
  ['记录不存在', 'This record no longer exists.'],
  ['方法不支持', 'This operation is not supported.'],
  ['JSON 请求格式无效', 'The request contains invalid JSON.'],
  ['写入操作需要 application/json', 'Write requests must use application/json.'],
  ['这条认知已更新，请刷新后再修改', 'This entry has changed. Refresh before editing it.'],
  ['文件已被更新，请刷新后再保存', 'This file has changed. Refresh before saving.'],
  ['记录仍被引用，请先修改关联记录', 'This record is still referenced. Update the linked records first.'],
  ['任务正在执行', 'The task is already running.'],
  ['请先停止任务再编辑其配置', 'Stop the task before changing its configuration.'],
  ['请先停止运行中的任务', 'Stop the running task first.'],
  ['请先中断模型执行，再编辑这份产物，避免模型同时写入。', 'Stop the model run before editing this artifact to avoid simultaneous writes.'],
  ['任务已完成，不能将已发生的操作改写为取消', 'This task has completed. Completed actions cannot be changed to cancelled.'],
  ['已有任务的模型连接不能更换，请新建任务选择另一条连接。', 'An existing task keeps its model connection. Create a new task to use another connection.'],
  ['审批已结束或执行进程已中断', 'This approval has ended or the run was interrupted.'],
  ['审批决定无效', 'Invalid approval decision.'],
  ['会话还有待处理任务，请先处理审批、补充要求或停止任务。', 'This chat has an unfinished task. Handle its approval, add instructions, or stop it first.'],
  ['会话已有待处理任务。请在原任务中补充、处理审批或停止后再发送。', 'This chat has an unfinished task. Continue it, handle its approval, or stop it before sending a new request.'],
  ['此会话已有另一项待处理任务，请先完成或停止它。', 'This chat has another unfinished task. Complete or stop it first.'],
  ['会话已有另一项待处理任务，请在那项任务中继续。', 'This chat has another unfinished task. Continue in that task.'],
  ['私聊需选择 1 个 Agent，群聊需选择 2–12 个 Agent。', 'Choose one agent for a direct chat or 2–12 agents for a group.'],
  ['这项自动化已有待处理任务，请先完成、取消或处理它的审批与配置。', 'This automation has an unfinished task. Complete or cancel it, or resolve its approval and configuration first.'],
  ['尚未填写这条连接的密钥，未发送请求', 'This connection has no API key. No request was sent.'],
  ['请先选择另一条默认连接，再删除这条连接。', 'Choose another default connection before deleting this one.'],
  ['仍有 Agent 使用这条连接，请先修改其模型选择。', 'Agents still use this connection. Change their model selection first.'],
  ['已有任务记录绑定这条连接，为保留继续执行的能力，暂时不能删除。可以修改连接配置，或先删除对应任务。', 'Existing tasks use this connection, so it cannot be deleted while they may need to continue. Edit the connection or remove those tasks first.'],
  ['这条连接仍在执行任务，请等任务结束或先中断。', 'This connection is running a task. Wait for it to finish or stop the task first.'],
  ['模型地址无效', 'Invalid model service URL.'],
  ['使用 HTTPS 地址，或本机 HTTP 地址；地址不能含凭据、查询或片段', 'Use an HTTPS URL or a local HTTP URL without credentials, query parameters, or a fragment.'],
  ['Kimi 推理强度只支持 low、high 或 max。', 'Kimi supports low, high, or max reasoning effort.'],
  ['OpenRouter 应用名称使用可打印英文字符', 'Use printable ASCII characters for the OpenRouter app name.'],
  ['OpenRouter 需要填写完整模型 ID 或 preset（如 openrouter/free），不能填写平台名称。请从官方模型目录复制；不会自动替换你保存的模型。', 'Enter an OpenRouter model ID or preset (such as openrouter/free), not the platform name. Copy it from the official catalogue; your saved model will not be replaced automatically.'],
  ['请填写具体模型 ID，不能填写厂商或产品名称。', 'Enter a specific model ID, not a provider or product name.'],
  ['尚未创建产品工程师示例，请从设置进入。', 'The product engineer example has not been created yet. Open it from Settings.'],
  ['示例空间目录不可用，请检查本机存储。', 'The example space directory is unavailable. Check local storage.'],
  ['密钥格式无效', 'Invalid API key format.'],
  ['不能同时保存和清除密钥', 'A key cannot be saved and cleared in the same request.'],
  ['来源原文不可覆盖。请导入一份新的反馈来源，并在认知修订中关联它。', 'Source text cannot be overwritten. Import new feedback and link it in the revised entry.'],
  ['导入的聊天记录不可改写，请保留原文件并导入新的反馈来源。', 'Imported chats cannot be rewritten. Keep the original file and import new feedback.'],
  ['导入预览已过期，请重新选择文件并核对。', 'This import preview has expired. Select the file again and review it.'],
  ['文件内相同消息 ID 的内容冲突，请先核对原始导出。', 'Messages with the same ID have conflicting contents. Check the original export first.'],
  ['文件没有可导入会话。', 'The file contains no chats to import.'],
  ['头像图片不能超过 3 MB', 'Avatar images must be 3 MB or smaller.'],
  ['请选择 PNG、JPEG 或 WebP 图片', 'Choose a PNG, JPEG, or WebP image.'],
  ['头像格式与图片内容不一致', 'The avatar format does not match its contents.'],
  ['头像内容无效', 'Invalid avatar contents.'],
  ['头像不存在', 'This avatar no longer exists.'],
  ['头像文件无效', 'Invalid avatar file.'],
  ['请选择 PNG、JPEG、WebP 或 AVIF 图片', 'Choose a PNG, JPEG, WebP, or AVIF image.'],
  ['图片不能超过 8 MB', 'Images must be 8 MB or smaller.'],
  ['图片内容为空', 'The image is empty.'],
  ['图片编码无效', 'Invalid image encoding.'],
  ['图片格式与内容不一致，或文件格式不受支持', 'The image format does not match its contents or is unsupported.'],
  ['资料链接必须是有效的 HTTP(S) 地址', 'Source links must be valid HTTP(S) URLs.'],
  ['资料链接不能包含用户名或密码', 'Source links cannot contain a username or password.'],
  ['尚未设置自定义图片', 'No custom image has been set.'],
];

function translatedMessage(message: string): string {
  const known = knownMessages.find(([zh, en])=>message===zh||message===en);
  if (known) return t(known[0], known[1]);
  if (['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'].includes(message)) {
    return t('无法连接本机服务，请确认应用仍在运行后重试。', 'Could not reach the local service. Make sure the app is running, then try again.');
  }
  const request = /^请求未完成（(\d{3})）$/.exec(message);
  if (request) return t(message, `The request did not finish (${request[1]}).`);
  const field = /^([a-zA-Z][a-zA-Z0-9_.]*) (无效或过长|无效|必须为布尔值|必须是标识列表)$/.exec(message);
  if (field) {
    const descriptions: Record<string, string> = {'无效或过长':'is invalid or too long','无效':'is invalid','必须为布尔值':'must be a boolean','必须是标识列表':'must be a list of identifiers'};
    return t(message, `${field[1]} ${descriptions[field[2]]}.`);
  }
  return message;
}

export class APIError extends Error {
  readonly rawMessage: string;
  constructor(message: string, public status: number, public code?: string) {
    super(translatedMessage(message));
    this.rawMessage = message;
  }
}

const demoOriginals = new Map<string, unknown>();
let demoBootstrapSequence = 0;
function cacheDemoOriginals(data: unknown) {
  demoOriginals.clear();
  if (!data || typeof data !== 'object') return;
  const bootstrap = data as Record<string, unknown>;
  const profile = bootstrap.profile as { demo?: boolean } | undefined;
  if (profile?.demo !== true) return;
  demoOriginals.set('profile/profile', structuredClone(profile));
  for (const [collection, records] of Object.entries(bootstrap)) {
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (record && typeof record === 'object' && typeof record.id === 'string') demoOriginals.set(`${collection}/${record.id}`, structuredClone(record));
    }
  }
}

export async function api<T>(path: string, init: RequestInit = {}, originalSpace = false): Promise<T> {
  const requestSpace = originalSpace ? 'main' : currentSpace();
  const bootstrapSequence = requestSpace === ENGINEER_SPACE && path === '/bootstrap' && (init.method || 'GET').toUpperCase() === 'GET' ? ++demoBootstrapSequence : 0;
  const response = await fetch(originalSpace ? `/api${path}` : apiUrl(path), {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const text = await response.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; }
  catch { throw new APIError('本机服务返回了无法读取的结果，请稍后重试。', response.status); }
  if (!response.ok) {
    const error = data as { error?: unknown; code?: unknown } | undefined;
    throw new APIError(typeof error?.error === 'string' && error.error ? error.error : `请求未完成（${response.status}）`, response.status, typeof error?.code === 'string' ? error.code : undefined);
  }
  if (bootstrapSequence && bootstrapSequence === demoBootstrapSequence) cacheDemoOriginals(data);
  return data as T;
}
export const write = <T,>(path: string, body?: unknown, method = 'POST') => {
  let payload=body;
  // An unchanged English sample field is a display translation, not a user edit.
  // The real personal space and newly authored text always pass through verbatim.
  if(currentSpace()===ENGINEER_SPACE&&getLocale()==='en'&&body&&['PUT','PATCH'].includes(method.toUpperCase())){
    const [endpoint,id]=path.replace(/^\//,'').split('/');
    const collection=endpoint==='agent-rooms'?'agentRooms':endpoint==='goal-lists'?'goalLists':endpoint;
    const original=demoOriginals.get(`${collection}/${id||'profile'}`);
    if(original!==undefined&&(id||collection==='profile'))payload=canonicalDemoValue(collection,id||'profile',body,'en',original);
  }
  return api<T>(path, { method, ...(['POST','PUT','PATCH'].includes(method.toUpperCase()) || body !== undefined ? { body: JSON.stringify(payload ?? {}) } : {}) });
};
export const messageOf = (error: unknown) => error instanceof APIError ? translatedMessage(error.rawMessage) : error instanceof Error ? translatedMessage(error.message) : t('操作未完成，请重试。', 'The operation did not finish. Please try again.');
