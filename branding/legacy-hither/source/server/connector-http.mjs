import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { HttpError } from './store.mjs';

const fail = (message, code = 'connector_protocol_error') => new HttpError(400, message, code);
const MAX_BYTES = 1_048_576;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);

export function connectorUrl(value, allowLocalhost = false) {
  let url;
  try { url = new URL(value); } catch { throw fail('MCP 地址无效。', 'invalid_connector_url'); }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw fail('MCP 使用 HTTPS 地址；凭据请填入独立密钥栏，地址不能含查询或片段。', 'invalid_connector_url');
  }
  if (LOOPBACK.has(url.hostname)) {
    if (!allowLocalhost) throw fail('连接本机 MCP 服务需要明确启用本机地址。', 'connector_localhost_required');
  } else if (url.protocol !== 'https:') throw fail('远端 MCP 服务必须使用 HTTPS。', 'invalid_connector_url');
  return url;
}

// Conservatively admit global unicast addresses only. A selected loopback endpoint
// is the sole private-network exception; redirects never inherit its permission.
export function publicConnectorAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) ||
      a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113);
  }
  if (version === 6) {
    const normalized = new URL(`https://[${address}]/`).hostname.slice(1,-1);
    // Reject mapped IPv4, ULA, link-local, multicast, 6to4 and documentation ranges.
    return /^[23][0-9a-f]{3}:/.test(normalized) && !normalized.startsWith('2002:') &&
      !/^2001:(?:0:|db8:|10:|20:|2:)/.test(normalized);
  }
  return false;
}

export async function connectorTarget(config, { resolve = lookup, blockedPorts = [], signal, timeoutMs = 15000 } = {}) {
  const url = connectorUrl(config.url, config.allowLocalhost);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (LOOPBACK.has(url.hostname)) {
    if (blockedPorts.map(Number).includes(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))) {
      throw fail('MCP 不能指向 Hither 自己的服务端口。', 'connector_address_denied');
    }
    return { url, address: host === '::1' ? '::1' : '127.0.0.1', family: host === '::1' ? 6 : 4 };
  }
  let addresses;
  let timer, abort;
  try {
    addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
      resolve(host, { all: true, verbatim: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(fail('MCP 地址解析超时。', 'connector_timeout')), timeoutMs); }),
      new Promise((_, reject) => { abort = () => reject(Object.assign(new Error('连接器操作已取消。'), { name: 'AbortError' })); signal?.addEventListener('abort', abort, { once: true }); if(signal?.aborted)abort(); }),
    ]);
  } catch(error) { if(error instanceof HttpError || error.name==='AbortError')throw error; throw fail('无法解析 MCP 服务地址。', 'connector_unreachable'); }
  finally { clearTimeout(timer); if(abort)signal?.removeEventListener('abort',abort); }
  if (!addresses.length || addresses.some(item => !publicConnectorAddress(item.address))) {
    throw fail('MCP 地址指向私有、保留或不可路由网络，未发送请求。', 'connector_address_denied');
  }
  return { url, ...addresses[0] };
}

/** Bounded Streamable HTTP JSON-RPC, with DNS pinned to the validated address. */
export async function connectorRpc(config, token, message, { signal, timeoutMs = 15000, session, protocol, ...network } = {}) {
  signal?.throwIfAborted();
  const target = await connectorTarget(config, { ...network, signal, timeoutMs });
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false, bytes = 0, buffer = '', eventBuffer = '', response;
    const done = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve({ result, session: response?.headers['mcp-session-id'] });
      response?.destroy(); req.destroy();
    };
    const abort = () => done(Object.assign(new Error('连接器操作已取消。'), { name: 'AbortError' }));
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(session ? { 'Mcp-Session-Id': session } : {}),
      ...(protocol ? { 'MCP-Protocol-Version': protocol } : {}) };
    const req = (target.url.protocol === 'https:' ? https : http).request(target.url, {
      method: 'POST', headers, agent: false,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [{ address: target.address, family: target.family }]) : callback(null, target.address, target.family),
    }, res => {
      response = res;
      if (res.statusCode < 200 || res.statusCode >= 300) {
        done(fail(res.statusCode === 401 || res.statusCode === 403 ? 'MCP 服务拒绝认证，请检查凭据或服务权限。' : `MCP 服务返回 HTTP ${res.statusCode}，连接未通过。`, 'connector_http_error')); return;
      }
      const receivedSession = res.headers['mcp-session-id'];
      if (receivedSession && (typeof receivedSession !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(receivedSession))) {
        done(fail('MCP 服务返回无效的会话标识。')); return;
      }
      if (!Object.hasOwn(message, 'id')) { res.resume(); done(null, undefined); return; }
      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!['application/json', 'text/event-stream'].includes(type)) { done(fail('MCP 返回的内容类型不是 JSON 或事件流。')); return; }
      const accept = data => {
        let value; try { value = JSON.parse(data); } catch { done(fail('MCP 返回了无效 JSON。')); return; }
        if (value?.jsonrpc !== '2.0' || typeof value !== 'object' || Array.isArray(value)) { done(fail('MCP 返回了无效协议消息。')); return; }
        if (value.id !== message.id) {
          // Progress notifications are allowed; interactive server requests are not
          // implemented and must never receive an implicit approval.
          if (value.method && !Object.hasOwn(value, 'id')) return;
          done(fail('MCP 返回了不匹配的响应或不支持的服务端请求。')); return;
        }
        if (value.error || !Object.hasOwn(value, 'result')) { done(fail('MCP 方法执行失败；未采用服务端返回的错误正文。')); return; }
        done(null, value.result);
      };
      res.setEncoding('utf8');
      res.on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_BYTES) { done(fail('MCP 返回超过 1 MB，已停止读取。', 'connector_response_too_large')); return; }
        if (type === 'application/json') { buffer += chunk; return; }
        eventBuffer = (eventBuffer + chunk).replace(/\r\n/g, '\n');
        let boundary;
        while (!settled && (boundary = eventBuffer.indexOf('\n\n')) >= 0) {
          const event = eventBuffer.slice(0, boundary); eventBuffer = eventBuffer.slice(boundary + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (data) accept(data);
        }
      });
      res.on('end', () => { if (!settled) type === 'application/json' ? accept(buffer) : done(fail('MCP 事件流结束但没有对应结果。')); });
      res.on('error', () => done(fail('读取 MCP 响应时连接中断。', 'connector_unreachable')));
    });
    const timer = setTimeout(() => done(fail('MCP 请求超时，未自动重试。', 'connector_timeout')), timeoutMs);
    req.on('error', () => done(fail('无法连接 MCP 服务，请检查地址和服务状态。', 'connector_unreachable')));
    signal?.addEventListener('abort', abort, { once: true });
    req.end(JSON.stringify(message));
  });
}

export async function openConnectorSession(config, token, options = {}) {
  const request = (method, params = {}, session, protocol) => connectorRpc(config, token, { jsonrpc: '2.0', id: randomUUID(), method, params }, { ...options, session, protocol });
  const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hither', version: '0.1.0' } });
  const protocol = initialized.result?.protocolVersion;
  if (!PROTOCOLS.has(protocol) || !initialized.result?.capabilities?.tools || typeof initialized.result?.serverInfo?.name !== 'string') {
    throw fail('MCP 握手没有返回兼容协议和工具能力。');
  }
  const session = initialized.session;
  await connectorRpc(config, token, { jsonrpc: '2.0', method: 'notifications/initialized' }, { ...options, session, protocol });
  const tools = [], cursors = new Set(); let cursor;
  do {
    const { result } = await request('tools/list', cursor ? { cursor } : {}, session, protocol);
    if (!Array.isArray(result?.tools)) throw fail('MCP 未返回有效工具列表。');
    tools.push(...result.tools);
    if (tools.length > 64) throw fail('MCP 工具超过本次支持的 64 项，请在服务端限制工具范围。');
    cursor = result.nextCursor;
    if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 2048 || cursors.has(cursor) || cursors.size >= 8)) throw fail('MCP 工具分页标识无效或超过限制。');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return { tools, call: (name, args) => request('tools/call', { name, arguments: args }, session, protocol).then(value => value.result) };
}
