import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.mjs';
import { listProjectFiles } from '../server/projects.mjs';
import { defaultAppearance } from '../server/local-appearance.mjs';

// Run the exact desktop initialization chain in a new, owned temporary root.
// No existing data-directory option is accepted. No socket is ever opened.
async function readRoute(app, pathname) {
  const request = new EventEmitter();
  Object.assign(request, { method: 'GET', url: `/api${pathname}`, headers: { host: '127.0.0.1:58645' } });
  const response = new EventEmitter();
  let status, result;
  response.writeHead = code => { status = code; response.headersSent = true; };
  response.end = body => { result = JSON.parse(String(body)); response.writableFinished = true; };
  await app.handleRequest(request, response);
  if (status !== 200) throw new Error(`Canonical example export failed at ${pathname}: ${status}`);
  return result;
}

export async function exportCanonicalExamples() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'secondu-public-examples-')));
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const deny = () => { throw new Error('Public example export cannot execute tools or use the network.'); };
  const result = {};
  try {
    for (const [language, space, seedLocale] of [['zh', 'demo-cn-v1', 'zh-CN'], ['en', 'demo-us-v1', 'en']]) {
      const app = createApp({ dataDir: path.join(root, space), seedLocale, executionPolicy: 'showcase', scheduler: false,
        computerInfo: { codexAvailable: false }, runCodex: deny, runImCli: deny, runResourceCli: deny,
        imSetupOptions: { runCommand: deny, spawnProcess: deny, installRuntime: deny },
        chooseDirectory: deny, modelFetch: deny, remoteTransport: new Proxy({}, { get: () => deny }),
        developmentRoot: projectRoot, _allowDemoSpace: false });
      try {
        const bootstrap = app.bootstrap();
        const responses = {};
        for (const route of ['/runtime/capabilities', '/computers', '/delegations', '/im-setup', '/im-connections', '/im-outbox', '/agent-resources', '/settings/appearance', '/settings/artwork/info', '/development/review']) responses[route] = await readRoute(app, route);
        // A fresh desktop space has no saved preferences. Materialize its real
        // defaults so mounting the website never writes defaults over its host.
        responses['/settings/appearance'] ??= { ...defaultAppearance, language: seedLocale };
        for (const document of responses['/development/review'].documents) responses[`/development/documents?path=${encodeURIComponent(document.path)}`] = await readRoute(app, `/development/documents?path=${encodeURIComponent(document.path)}`);
        for (const task of bootstrap.tasks) for (const action of ['context', 'trace', 'feedback']) responses[`/tasks/${task.id}/${action}`] = await readRoute(app, `/tasks/${task.id}/${action}`);
        // Only folders materialized by the canonical initializer are enumerated.
        const paths = [];
        for (const project of bootstrap.projects) {
          if (project.kind !== 'local' || !project.path?.startsWith(root + path.sep)) throw new Error('Canonical export encountered a non-example project.');
          const virtualPath = `/examples/${space}/${path.basename(project.path)}`;
          paths.push([project.path, virtualPath]);
          const pending = [''];
          while (pending.length) {
            const relative = pending.shift();
            const route = `/projects/${project.id}/files?path=${encodeURIComponent(relative)}`;
            const listing = listProjectFiles(app.store, project.id, relative);
            responses[route] = listing;
            for (const item of listing.entries) if (item.kind === 'directory') pending.push(item.path);
            if (Object.keys(responses).length > 1000) throw new Error('Canonical example file listing exceeded its bound.');
          }
          project.path = virtualPath;
        }
        bootstrap.computer = { id: 'local', name: language === 'en' ? 'Website example' : '官网示例', platform: 'browser', status: 'offline', workspace: '', codexAvailable: false };
        // Keep every authored field. Substitute only environment-derived paths.
        const clean = value => {
          if (typeof value === 'string') { for (const [from, to] of paths) value = value.replaceAll(from, to); return value; }
          if (Array.isArray(value)) return value.map(clean);
          if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
          return value;
        };
        const snapshot = clean({ space, bootstrap, responses });
        const encoded = JSON.stringify(snapshot);
        if (encoded.includes(root) || encoded.includes(hostname()) || /\/Users\/|\/home\/[^/]+\//.test(encoded)) throw new Error('A machine-specific path entered the public example.');
        if (!snapshot.bootstrap.profile.demo || snapshot.bootstrap.modelConnections.some(item => item.hasKey)) throw new Error('Public export must contain only unconnected canonical examples.');
        result[language] = snapshot;
      } finally { await app.close(); }
    }
    return result;
  } finally { await rm(root, { recursive: true, force: true }); }
}
