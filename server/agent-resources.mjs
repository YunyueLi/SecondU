import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError, id, now } from './store.mjs';
import { runImCli } from './im-cli.mjs';

export const RESOURCE_PROTOCOL = 'secondu.resources.v1';
export const RESOURCE_CHECK_TTL_MS = 15 * 60 * 1000;
const kinds = ['phone', 'email', 'payment', 'im'];
const actions = ['read', 'draft', 'send', 'call', 'pay'];
const kindActions = { phone: ['read', 'draft', 'send', 'call'], email: ['read', 'draft', 'send'], payment: ['read', 'draft', 'pay'], im: ['read', 'draft', 'send'] };
const outward = new Set(['send', 'call', 'pay']);
const invalid = message => { throw new HttpError(400, message, 'resource_invalid'); };
function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function string(value, label, max = 200, required = true) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value) || (required && !value.trim())) invalid(`${label}格式无效。`);
  return value.trim();
}
function exactKeys(value, allowed, label) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(`${label}包含不支持的字段；请勿填写密码、密钥或银行卡信息。`);
}
function normalizedIdentifier(kind, value) {
  const input = string(value, kind === 'payment' ? '付款账号别名' : '资源标识', 200);
  if (kind === 'phone') {
    const phone = input.replace(/[ ()-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) invalid('手机号请包含国家或地区代码，例如 +8613800000000。');
    return phone;
  }
  if (kind === 'email') {
    if (input.length > 254 || !/^[^\s@<>]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(input)) invalid('请输入完整有效的邮箱地址。');
    const at = input.lastIndexOf('@');
    return input.slice(0, at) + '@' + input.slice(at + 1).toLowerCase();
  }
  if (kind === 'payment' && (/\d{12,}/.test(input.replace(/[ -]/g, '')) || !/[^\d\s-]/.test(input))) invalid('付款资源只保存服务商中的账号别名，请勿填写卡号或银行账号。');
  return input;
}
function amountMinor(value, label) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) invalid(`${label}须为最多两位小数的正数。`);
  const [major, minor = ''] = value.split('.');
  const amount = Number(major) * 100 + Number(minor.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) invalid(`${label}超出允许范围。`);
  return amount;
}
function normalizedPolicy(kind, value) {
  exactKeys(value, [...actions, 'allowedTargets', 'budget'], '授权规则');
  const policy = {};
  for (const action of actions) {
    const mode = value[action] ?? 'deny';
    if (!(outward.has(action) ? ['deny', 'confirm'] : ['deny', 'allow']).includes(mode)) invalid('对外发送、拨号和付款必须逐次确认，不能配置为自动执行。');
    if (!kindActions[kind].includes(action) && mode !== 'deny') invalid('这类资源不支持所选权限。');
    policy[action] = mode;
  }
  if (!Array.isArray(value.allowedTargets ?? []) || (value.allowedTargets ?? []).length > 50) invalid('授权对象最多填写 50 个。');
  policy.allowedTargets = [...new Set((value.allowedTargets ?? []).map(target => string(target, '授权对象', 200)))];
  if (kind === 'payment') {
    if (value.budget !== undefined) {
      exactKeys(value.budget, ['currency', 'perPaymentLimit'], '付款预算');
      const currency = string(value.budget.currency, '币种', 3).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) invalid('币种请填写三个英文字母，例如 CNY。');
      const minor = amountMinor(value.budget.perPaymentLimit, '单笔付款上限');
      policy.budget = { currency, perPaymentLimit: (minor / 100).toFixed(2) };
    }
    if (policy.pay === 'confirm' && !policy.budget) invalid('允许付款前，请先设置币种和单笔上限。');
  } else if (value.budget !== undefined) invalid('只有付款资源可以设置付款预算。');
  return policy;
}
function currentCheck(check) { return check?.checkedAt && Number.isFinite(Date.parse(check.checkedAt)) && Date.now() - Date.parse(check.checkedAt) < RESOURCE_CHECK_TTL_MS && Date.parse(check.checkedAt) <= Date.now() + 5000; }

/** Local bindings and eligibility checks only. No method sends, calls or pays. */
export class AgentResourcesService {
  constructor(store, { im, runCli = runImCli } = {}) { this.store = store; this.im = im; this.runCli = runCli; this.busy = new Set(); }
  subject(agentId) {
    string(agentId, '所属身份', 200);
    if (agentId !== 'hither' && !this.store.get('agents', agentId)) throw new HttpError(404, '找不到对应的 Agent。', 'resource_subject_missing');
    return agentId;
  }
  list(agentId) {
    if (agentId !== undefined && agentId !== null) this.subject(agentId);
    return this.store.list('agentResources').filter(resource => !agentId || resource.agentId === agentId).map(resource => this.present(resource));
  }
  get(key) { return this.present(this.store.require('agentResources', key)); }
  present(resource) {
    const { verification, probeToken, connectionRevision, ...publicResource } = resource;
    let check = verification || { status: 'pending', statusMessage: '尚未检查账号和可用能力。', capabilities: [] };
    let connection;
    if (!resource.enabled) check = { status: 'disabled', statusMessage: '已停用此身份的资源绑定。原账号保持不变。', capabilities: [] };
    else if (resource.agentId !== 'hither' && !this.store.get('agents', resource.agentId)) check = { status: 'unavailable', statusMessage: '原 Agent 已不可用，此绑定不能继续使用。', capabilities: [] };
    else if (resource.probeToken) check = { status: 'pending', statusMessage: '本次检查尚未完成。若工具已退出，可重新检查。', capabilities: [] };
    else if (resource.adapter === 'unconnected') check = { status: 'pending', statusMessage: '已保存资源信息，等待接入已有工具。', capabilities: [] };
    else if (resource.adapter === 'im-connection') {
      connection = this.store.get('imConnections', resource.connectionId);
      if (!connection) check = { status: 'unavailable', statusMessage: '原通信连接已不可用，请重新选择连接。', capabilities: [] };
      else if (connection.revision !== connectionRevision || connection.accountId !== resource.identifier || connection.channel !== resource.provider) check = { status: 'pending', statusMessage: '通信连接的配置已变化，请编辑并重新绑定。', capabilities: [] };
      else {
        const ready = connection.status === 'ready';
        check = { status: ready ? 'ready' : connection.status === 'error' ? 'error' : connection.status === 'unavailable' ? 'unavailable' : 'pending', statusMessage: ready ? '已继承原通信连接的账号检查结果。' : connection.statusMessage || '请先检查原通信连接。', checkedAt: connection.lastCheckedAt, capabilities: ready ? ['draft', ...(connection.canRead ? ['read'] : []), ...(connection.canSend ? ['send'] : [])] : [] };
        if (verification?.status === 'error' && (!connection.lastCheckedAt || verification.checkedAt >= connection.lastCheckedAt)) check = verification;
      }
    }
    if (check.status === 'ready' && !currentCheck(check)) check = { ...check, status: 'pending', capabilities: [], statusMessage: '账号检查已过期，请重新检查可用能力。' };
    const capabilities = check.capabilities || [];
    const usableActions = check.status === 'ready' ? capabilities.filter(action => resource.policy[action] !== 'deny') : [];
    return { ...publicResource, status: check.status, statusMessage: check.statusMessage, capabilities, usableActions, ...(check.checkedAt ? { checkedAt: check.checkedAt, checkExpiresAt: new Date(Date.parse(check.checkedAt) + RESOURCE_CHECK_TTL_MS).toISOString() } : {}), ...(connection ? { connectionName: connection.name, connectionTarget: connection.target } : {}) };
  }
  save(body, key) {
    exactKeys(body, ['agentId', 'kind', 'name', 'identifier', 'provider', 'adapter', 'command', 'connectionId', 'policy', 'enabled', 'revision'], '资源配置');
    const existing = key ? this.store.require('agentResources', key) : undefined;
    if (existing && body.revision !== existing.revision) throw new HttpError(409, '资源已被修改，请刷新后再保存。', 'resource_revision');
    const agentId = this.subject(body.agentId);
    if (existing && existing.agentId !== agentId) invalid('不能把已有绑定转交给另一个身份；请在目标身份中新增绑定。');
    if (!kinds.includes(body.kind)) invalid('请选择有效的资源类型。');
    if (!['unconnected', 'local-cli', 'im-connection'].includes(body.adapter)) invalid('请选择有效的接入方式。');
    if (typeof body.enabled !== 'boolean') invalid('启用状态须为布尔值。');
    const resource = { id: existing?.id || id('resource'), agentId, kind: body.kind, name: string(body.name, '资源名称', 100), adapter: body.adapter, identifier: normalizedIdentifier(body.kind, body.identifier), provider: string(body.provider, '服务商', 100), enabled: body.enabled, policy: normalizedPolicy(body.kind, body.policy), revision: (existing?.revision || 0) + 1, createdAt: existing?.createdAt || now(), updatedAt: now() };
    if (body.adapter === 'local-cli') {
      resource.command = string(body.command, '本机工具路径', 1000);
      if (!path.isAbsolute(resource.command)) invalid('请填写本机可执行文件的绝对路径。');
    } else if (body.command) invalid('当前接入方式不使用本机工具路径。');
    if (body.adapter === 'im-connection') {
      if (body.kind !== 'im') invalid('已有通信连接只能绑定为通信账号。');
      const connection = this.store.require('imConnections', string(body.connectionId, '通信连接', 200));
      if (connection.accountId !== resource.identifier || connection.channel !== resource.provider) invalid('资源账号与选中的通信连接不一致。');
      resource.connectionId = connection.id; resource.connectionRevision = connection.revision;
    } else if (body.connectionId) invalid('当前接入方式不使用通信连接。');
    const duplicate = this.store.list('agentResources').find(item => item.id !== resource.id && item.agentId === resource.agentId && item.kind === resource.kind && item.identifier === resource.identifier && item.provider === resource.provider && (item.connectionId || '') === (resource.connectionId || ''));
    if (duplicate) throw new HttpError(409, '这个身份已经绑定了相同资源，请编辑已有绑定。', 'resource_duplicate');
    this.store.put('agentResources', resource);
    return this.present(resource);
  }
  setEnabled(key, body) {
    exactKeys(body, ['revision', 'enabled'], '启用设置');
    const resource = this.store.require('agentResources', key);
    if (body.revision !== resource.revision) throw new HttpError(409, '资源已被修改，请刷新后再操作。', 'resource_revision');
    if (typeof body.enabled !== 'boolean') invalid('启用状态须为布尔值。');
    const { verification, probeToken, ...rest } = resource;
    const next = { ...rest, enabled: body.enabled, revision: resource.revision + 1, updatedAt: now() };
    this.store.put('agentResources', next); return this.present(next);
  }
  async probe(key) {
    const resource = this.store.require('agentResources', key); this.subject(resource.agentId);
    if (!resource.enabled) throw new HttpError(409, '请先启用此资源绑定。', 'resource_disabled');
    if (resource.adapter === 'unconnected') return this.present(resource);
    if (this.busy.has(key)) throw new HttpError(409, '资源正在检查，请稍候。', 'resource_busy');
    const token = randomUUID();
    this.store.put('agentResources', { ...resource, probeToken: token }); this.busy.add(key);
    let verification;
    try {
      if (resource.adapter === 'im-connection') {
        const connection = this.store.require('imConnections', resource.connectionId);
        if (connection.revision !== resource.connectionRevision) throw new HttpError(409, '通信连接的配置已变化，请编辑并重新绑定。', 'resource_connection_changed');
        if (!this.im) throw new HttpError(503, '本机通信服务未启动。', 'resource_unavailable');
        await this.im.probe(connection.id);
      } else {
        const input = { protocol: RESOURCE_PROTOCOL, action: 'probe', requestId: token, resourceId: resource.id, agentId: resource.agentId, kind: resource.kind, identifier: resource.identifier, provider: resource.provider };
        const value = await this.runCli(resource.command, [], input, { timeout: 15000, maxBytes: 256 * 1024 });
        if (!plain(value) || value.protocol !== RESOURCE_PROTOCOL || value.action !== 'probe' || value.requestId !== token || value.resourceId !== resource.id || value.agentId !== resource.agentId || value.kind !== resource.kind || value.identifier !== resource.identifier || value.provider !== resource.provider) throw new HttpError(502, '工具返回的身份、账号或资源类型不匹配，未通过检查。', 'resource_probe_mismatch');
        if (typeof value.connected !== 'boolean' || !Array.isArray(value.capabilities) || value.capabilities.some(action => !kindActions[resource.kind].includes(action)) || (value.simulated !== undefined && typeof value.simulated !== 'boolean')) throw new HttpError(502, '工具没有返回有效的账号能力，未通过检查。', 'resource_probe_invalid');
        const simulated = value.simulated === true || value.dryRun === true;
        const status = !value.connected ? 'unavailable' : simulated ? 'simulated' : 'ready';
        verification = { status, checkedAt: now(), capabilities: value.connected ? [...new Set(value.capabilities)] : [], statusMessage: !value.connected ? '工具未确认该账号可用，请在原工具中完成连接。' : simulated ? '模拟工具已响应，尚未连接真实账号。' : '本机工具已确认此账号及返回的能力。' };
      }
    } catch (error) {
      verification = { status: 'error', checkedAt: now(), capabilities: [], statusMessage: error?.code === 'ENOENT' ? '没有找到本机资源工具，请检查安装位置。' : error?.code === 'EACCES' ? '本机资源工具没有执行权限。' : error?.code === 'im_timeout' ? '资源检查超时，请在原工具中检查账号状态。' : error?.code === 'im_output_limit' ? '资源工具返回内容超过限制。' : ['resource_probe_mismatch', 'resource_probe_invalid', 'resource_connection_changed', 'resource_unavailable'].includes(error?.code) ? error.message : '本机资源工具未完成检查。凭据与详细诊断请在原工具中查看。' };
    } finally { this.busy.delete(key); }
    const current = this.store.require('agentResources', key);
    if (current.revision !== resource.revision || current.probeToken !== token) throw new HttpError(409, '检查期间资源配置已变化，请重新检查。', 'resource_probe_stale');
    const { probeToken, verification: previousVerification, ...rest } = current;
    this.store.put('agentResources', { ...rest, ...(verification ? { verification } : {}) });
    return this.get(key);
  }
  checkPermission(key, request) {
    exactKeys(request, ['agentId', 'action', 'target', 'amount', 'currency'], '操作检查');
    const resource = this.get(key);
    const decision = (state, code, message) => ({ decision: state, code, message, executed: false, resourceId: key, revision: resource.revision });
    if (request.agentId !== resource.agentId) return decision('blocked', 'subject_mismatch', '此资源未授权给这个身份。');
    if (!actions.includes(request.action) || !kindActions[resource.kind].includes(request.action)) return decision('blocked', 'unsupported_action', '此资源不支持该操作。');
    if (!resource.enabled) return decision('blocked', 'disabled', '此资源绑定已停用。');
    if (resource.status !== 'ready') return decision('blocked', 'not_ready', resource.statusMessage);
    if (!resource.capabilities.includes(request.action)) return decision('blocked', 'capability_missing', '原工具没有确认此项能力。');
    if (resource.policy[request.action] === 'deny') return decision('blocked', 'permission_denied', '此项操作未获得授权。');
    if (outward.has(request.action)) {
      const target = string(request.target, '操作对象', 200);
      if (resource.connectionTarget && target !== resource.connectionTarget) return decision('blocked', 'connection_target_mismatch', '操作对象与绑定的通信会话不一致。');
      if (resource.policy.allowedTargets.length && !resource.policy.allowedTargets.includes(target)) return decision('blocked', 'target_denied', '操作对象不在授权范围内。');
      if (request.action === 'pay') {
        const amount = amountMinor(request.amount, '付款金额');
        if (request.currency !== resource.policy.budget?.currency) return decision('blocked', 'currency_mismatch', '币种与预算规则不一致。');
        if (amount > amountMinor(resource.policy.budget.perPaymentLimit, '单笔付款上限')) return decision('blocked', 'budget_exceeded', '付款金额超过单笔上限。');
      }
      return decision('confirmation_required', 'confirmation_required', '符合已保存的规则；执行前仍须逐次确认。本次只检查规则。');
    }
    return decision('allowed', 'allowed', '符合已保存的授权规则。本次未执行实际操作。');
  }
}
