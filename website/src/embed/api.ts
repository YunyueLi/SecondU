import { getLocale, t } from '../../../src/i18n';
import { createWebsiteExample } from './fixture';
import type { Bootstrap } from '../../../shared/contracts';

const stores = new Map<string, Bootstrap>();
const appearances = new Map<string, Record<string, unknown>>();
const downloads = new Map<string, string>();
const downloadNames = new Map<string, string>();
export const exampleDownloadName = (url: string) => downloadNames.get(url);
const language = () => getLocale() === 'en' ? 'en' : 'zh';
let lastBootstrap: Bootstrap | undefined;
export function syncExampleLanguage(next: 'zh' | 'en') {
  if (!stores.has(next)) stores.set(next, createWebsiteExample(next));
  if (lastBootstrap) Object.assign(lastBootstrap, structuredClone(stores.get(next)!));
}
const data = () => { const lang = language(); if (!stores.has(lang)) stores.set(lang, createWebsiteExample(lang)); return stores.get(lang)!; };
const clone = <T,>(value: T): T => structuredClone(value);
export class APIError extends Error {
  rawMessage: string;
  constructor(message: string, public status = 403, public code = 'website_demo_only') { super(message); this.rawMessage = message; }
}
const unavailable = () => new APIError(t('官网示例只保留本页修改。真实执行、账户连接和文件导入请在桌面版进行。', 'This website example keeps changes only in this page. Use the desktop app for real execution, account connections or file imports.'));
export const messageOf = (error: unknown) => error instanceof Error ? error.message : unavailable().message;

// This module replaces the product API only in the separate website iframe build.
// It never calls fetch or any network transport. Unsupported actions reject.
export async function api<T>(path: string, init: RequestInit = {}, _originalSpace = false): Promise<T> {
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const url = new URL(path, 'https://website.example');
  const parts = url.pathname.split('/').filter(Boolean);
  const method = (init.method || 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
  const store = data();
  if (method === 'GET' && url.pathname === '/bootstrap') { lastBootstrap = clone(store); return lastBootstrap as T; }
  if (url.pathname === '/settings/appearance') {
    const lang = language();
    if (method === 'PUT') appearances.set(lang, { ...appearances.get(lang), ...body });
    return clone({ theme: document.documentElement.dataset.theme || 'light', atmosphere: 'pencil', decorativeArtwork: false, accent: 'blue', fontSize: 14, opacity: 96, motion: 'reduced', sendKey: 'enter', language: getLocale(), ...appearances.get(lang) }) as T;
  }
  if (method === 'GET' && url.pathname === '/settings/artwork/info') return null as T;
  if (method === 'GET' && url.pathname === '/spaces') return { spaces: [] } as T;
  if (method === 'GET' && url.pathname === '/model-connections') return clone({ connections: store.modelConnections, defaultConnectionId: store.defaultConnectionId }) as T;
  if (method === 'PUT' && parts[0] === 'artifacts' && parts.length === 2) {
    const item = store.artifacts.find(row => row.id === parts[1]);
    if (!item) throw new APIError(t('示例文件不存在。', 'Example file not found.'), 404);
    if (body.baseVersion !== item.version) throw new APIError(t('文件已有更新，请重新打开后编辑。', 'The file has changed. Reopen it before editing.'), 409);
    if (typeof body.content !== 'string' || body.content.length > 1_000_000) throw new APIError(t('内容为空或超过示例编辑上限。', 'The content is invalid or exceeds the example editing limit.'), 400);
    item.content = body.content; item.version++; item.updatedAt = new Date().toISOString();
    item.versions.push({ version: item.version, content: item.content, createdAt: item.updatedAt, author: t('本页编辑', 'Edited in this page') });
    return clone(item) as T;
  }
  if (method === 'GET' && parts.length === 1 && Array.isArray(store[parts[0] as keyof Bootstrap])) return clone(store[parts[0] as keyof Bootstrap]) as T;
  throw unavailable();
}
export const write = <T,>(path: string, body?: unknown, method = 'POST') => api<T>(path, { method, body: JSON.stringify(body ?? {}) });
export async function getArrayBuffer(_path: string, _mime: string, _signal?: AbortSignal): Promise<ArrayBuffer> { throw unavailable(); }
export function apiUrl(path: string): string {
  const match = /^\/artifacts\/([^/]+)\/download\?version=([1-9]\d*)$/.exec(path);
  if (!match) return 'about:blank';
  const artifact = data().artifacts.find(item => item.id === match[1]);
  const version = artifact?.versions.find(item => item.version === Number(match[2]));
  if (!artifact || !version) return 'about:blank';
  const key = `${language()}:${artifact.id}:${version.version}:${version.content}`;
  if (!downloads.has(key)) {
    const url = URL.createObjectURL(new Blob([version.content], { type: artifact.name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
    downloads.set(key, url); downloadNames.set(url, artifact.name);
  }
  return downloads.get(key)!;
}
addEventListener('pagehide', () => { for (const value of downloads.values()) URL.revokeObjectURL(value); downloads.clear(); downloadNames.clear(); });
