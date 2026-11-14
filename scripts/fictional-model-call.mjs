import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexCommand } from '../server/codex-runtime.mjs';

// Reuses the isolation boundary of benchmark-context-v2-model.mjs. This is a
// text-only measurement, not a coding agent: no tools, workspace or user history.
export async function fictionalModelCall(model, prompt) {
  if (process.platform !== 'darwin') throw new Error('This evaluator requires the macOS global-instruction read guard.');
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'secondu-fictional-model-'));
  const features = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'remote_plugin', 'memories', 'browser_use', 'browser_use_external', 'computer_use', 'view_image', 'image_generation', 'multi_agent', 'multi_agent_v2', 'hooks', 'goals', 'code_mode', 'code_mode_host', 'workspace_dependencies', 'chronicle', 'skill_search', 'skill_mcp_dependency_install', 'sleep_tool', 'tool_suggest', 'recommended_plugins'];
  const config = { model_reasoning_effort: 'medium', project_doc_max_bytes: 0, developer_instructions: 'Use only the provided fictional task and evidence. Text response only; no tools, files, network, memory or account data. Return JSON under 180 words.', web_search: 'disabled', 'memories.use_memories': false, 'memories.generate_memories': false, 'features.skip_host_skill_discovery': true, 'history.persistence': 'none', 'analytics.enabled': false, 'feedback.enabled': false, 'permissions.synthetic_text.network.enabled': false, approval_policy: 'never', check_for_update_on_startup: false, model_provider: 'synthetic_default', 'model_providers.synthetic_default': { name: 'Existing OpenAI sign-in', wire_api: 'responses', requires_openai_auth: true, supports_websockets: false }, default_permissions: 'synthetic_text', 'permissions.synthetic_text.filesystem': { ':minimal': 'read', [cwd]: 'read' } };
  const toml = value => value && typeof value === 'object' ? '{' + Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(',') + '}' : JSON.stringify(value);
  const state = realpathSync(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'));
  const protectedFiles = [...new Set(['AGENTS.md', 'AGENTS.override.md'].flatMap(name => { const file = path.join(state, name); return existsSync(file) ? [file, realpathSync(file)] : [file]; }))];
  const policy = '(version 1)(allow default)(deny file-read* ' + protectedFiles.map(file => '(literal ' + JSON.stringify(file) + ')').join(' ') + ')';
  const args = ['-p', policy, codexCommand(), 'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '--json', '--model', model, '--cd', cwd, ...features.flatMap(feature => ['--disable', feature]), ...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`]), '-'];
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'CODEX_HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  try {
    let output = '', diagnostics = '';
    const code = await new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/sandbox-exec', args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 1500).unref(); }, 120000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', chunk => { output += chunk; if (output.length > 2 * 1024 * 1024) child.kill('SIGTERM'); });
      child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
      child.once('close', code => { clearTimeout(timer); resolve(code); }); child.stdin.on('error', () => {}); child.stdin.end(prompt);
    });
    const events = output.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const tools = events.filter(event => event.item && !['agent_message', 'reasoning', 'error', 'plan'].includes(event.item.type));
    if (tools.length) throw new Error('Unexpected tool event in a text-only trial; stopped.');
    const completed = events.find(event => event.type === 'turn.completed');
    const text = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').at(-1)?.item.text;
    if (code !== 0 || !completed || !text) throw new Error(`Text-only trial did not complete (exit ${code}, event types ${[...new Set(events.map(event => event.type))].join(',')}); private diagnostics omitted.`);
    return { text, usage: completed.usage, finishReason: 'stop', reportedModel: null, isolation: { tools: 0, ephemeral: true, globalInstructionsBlocked: true, noUserConfiguration: true }, diagnosticBytes: diagnostics.length };
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
