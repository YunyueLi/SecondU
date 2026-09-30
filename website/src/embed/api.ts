import { getLocale, t } from '../../../src/i18n';
import { createWebsiteExample, type ExampleLanguage } from './fixture';
import { ExampleRuntime, ExampleError } from './memory-runtime.mjs';
import type { Bootstrap } from '../../../shared/contracts';

const stores = new Map<ExampleLanguage, ExampleRuntime>();
const downloads = new Map<string, string>();
const downloadNames = new Map<string, string>();
const exportContents = new Map<string, string>();
export const exampleDownloadName = (url: string) => downloadNames.get(url);
const language = (): ExampleLanguage => getLocale() === 'en' ? 'en' : 'zh';
const runtime = (lang = language()) => {
  if (!stores.has(lang)) stores.set(lang, new ExampleRuntime(createWebsiteExample(lang)));
  return stores.get(lang)!;
};
let lastBootstrap: Bootstrap | undefined;
let websiteThemePreference: 'light' | 'dark' | 'system' = 'system';
export function setWebsiteThemePreference(value: 'light' | 'dark' | 'system') { websiteThemePreference = value; }
export function exampleChatRoute(lang = language()) { return `task/${runtime(lang).chooseChat()}`; }
export function syncExampleLanguage(next: ExampleLanguage) {
  const target = runtime(next);
  if (lastBootstrap) Object.assign(lastBootstrap, structuredClone(target.data));
}
export class APIError extends Error {
  rawMessage: string;
  constructor(message: string, public status = 403, public code = 'website_demo_only') { super(message); this.rawMessage = message; }
}
const unavailable = () => new APIError(t('官网示例保留本页修改。实际执行、连接账户和访问本机文件，请使用桌面版。', 'Changes remain in this page. Use the desktop app to run tasks, connect accounts or access local files.'), 403, 'showcase_read_only');
export const messageOf = (error: unknown) => error instanceof Error ? error.message : unavailable().message;

// Replaces only the website build's API. There is intentionally no fetch fallback.
export async function api<T>(path: string, init: RequestInit = {}, _originalSpace = false): Promise<T> {
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  try {
    const method = (init.method || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
    const value = await runtime().response(path, method, body);
    if (path === '/bootstrap') lastBootstrap = value as Bootstrap;
    if (path === '/settings/appearance' && method === 'PUT' && ['light', 'dark', 'system'].includes(body.theme)) websiteThemePreference = body.theme;
    if (path === '/settings/appearance' && value && typeof value === 'object') Object.assign(value, { language: getLocale(), theme: websiteThemePreference });
    if (path === '/settings/appearance' && method === 'PUT') parent.postMessage({ type: 'secondu-example-preferences', ...(['light', 'dark', 'system'].includes(body.theme) ? { theme: body.theme } : {}), ...(['zh-CN', 'en'].includes(body.language) ? { language: body.language === 'en' ? 'en' : 'zh' } : {}) }, location.origin);
    return value as T;
  } catch (error) {
    if (error instanceof ExampleError && error.code === 'showcase_read_only') throw unavailable();
    if (error && typeof error === 'object' && 'status' in error) throw new APIError(error instanceof Error ? error.message : t('无法完成这项操作。', 'This action could not be completed.'), Number(error.status), 'code' in error ? String(error.code) : undefined);
    throw error;
  }
}
export const write = <T,>(path: string, body?: unknown, method = 'POST') => api<T>(path, { method, body: JSON.stringify(body ?? {}) });
export async function getArrayBuffer(_path: string, _mime: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // Canonical examples contain authored Markdown. Office conversion requires the
  // desktop's local converter, and must never be simulated by invented bytes.
  throw unavailable();
}
export function apiUrl(path: string): string {
  const url = new URL(path, 'https://website.example');
  if (url.origin !== 'https://website.example') return 'about:blank';
  let bytes: BlobPart, name: string, mime: string, key: string;
  if (url.pathname === '/export') {
    const content = JSON.stringify({ exportVersion: 1, ...runtime().data }, null, 2);
    name = `${runtime().data.profile.name}-example.json`; mime = 'application/json'; key = `${language()}:export`;
    if (exportContents.get(key) !== content) {
      const previous = downloads.get(key);
      if (previous) { URL.revokeObjectURL(previous); downloadNames.delete(previous); downloads.delete(key); }
      exportContents.set(key, content);
    }
    bytes = content;
  } else {
    const match = /^\/artifacts\/([^/]+)\/download$/.exec(url.pathname);
    if (!match || url.searchParams.getAll('version').length !== 1 || !/^[1-9]\d*$/.test(url.searchParams.get('version') || '')) return 'about:blank';
    try {
      const file = runtime().download(decodeURIComponent(match[1]), Number(url.searchParams.get('version')));
      bytes = file.bytes; name = file.name; mime = file.mime; key = `${language()}:${match[1]}:${file.version}`;
    } catch { return 'about:blank'; }
  }
  if (!downloads.has(key)) {
    const href = URL.createObjectURL(new Blob([bytes], { type: mime })); downloads.set(key, href); downloadNames.set(href, name);
  }
  return downloads.get(key)!;
}
addEventListener('pagehide', () => { for (const value of downloads.values()) URL.revokeObjectURL(value); downloads.clear(); downloadNames.clear(); exportContents.clear(); });
