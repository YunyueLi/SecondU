import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import ts from 'typescript';
import path from 'node:path';
import { mkdir, cp, readFile, readdir, lstat } from 'node:fs/promises';
import { exportCanonicalExamples } from './export-examples.mjs';

/** Build the real product App with a website-only in-memory adapter. */
export async function buildEmbeddedProduct({ root, output, base }) {
  const directory = path.join(root, 'website');
  const productRoot = path.join(root, 'src');
  const apiSource = path.join(productRoot, 'api');
  const apiAdapter = path.join(directory, 'src/embed/api.ts');
  const isolatedStorage = path.join(directory, 'src/embed/storage.ts');
  const serverStore = path.join(root, 'server/store.mjs');
  const portableModules = new Set(['personal-context.mjs', 'room-reactions.mjs'].map(file => path.join(root, 'server', file)));
  const examples = await exportCanonicalExamples();
  const embeddedBase = `${base}product/`;
  const outDir = path.resolve(root, output, 'product');
  const brandFile = path.join(root, 'shared/brand.json');
  const brand = JSON.parse(await readFile(brandFile, 'utf8'));
  const brandFields = ['wordmark', 'mark', 'favicon'];
  let brandRewritten = false;
  await mkdir(outDir, { recursive: true });
  // A stable reviewed file list; never publish a whole directory implicitly.
  const assets = JSON.parse(await readFile(path.join(directory, 'embed-public-assets.json'), 'utf8')).files;
  for (const field of brandFields) {
    if (typeof brand[field] !== 'string' || !brand[field].startsWith('/brand/') || !assets.includes(brand[field].slice(1))) throw new Error(`Embedded brand asset is missing from the reviewed allowlist: ${field}`);
  }
  for (const file of assets) {
    if (typeof file !== 'string' || !/^(art|brand|fonts|icons)\//.test(file) || file.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid embedded product public asset.');
    const source = path.join(root, 'public', file);
    if (!(await lstat(source)).isFile()) throw new Error('Embedded public assets must be regular files.');
    const target = path.join(outDir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
  await build({
    configFile: false, root: directory, base: embeddedBase, publicDir: false,
    resolve: { dedupe: ['react', 'react-dom', '@openai/apps-sdk-ui'] },
    plugins: [{
      name: 'website-product-isolation', enforce: 'pre',
      resolveId(source, importer) {
        if (source === 'virtual:secondu-canonical-examples') return '\0secondu-canonical-examples';
        if (importer && portableModules.has(importer.split('?')[0]) && path.resolve(path.dirname(importer), source) === serverStore) return path.join(directory, 'src/embed/runtime-store.mjs');
        if (importer && source.startsWith('.') && path.resolve(path.dirname(importer.split('?')[0]), source).replace(/\.tsx?$/, '') === apiSource) return apiAdapter;
      },
      load(id) {
        if (id === '\0secondu-canonical-examples') return `export default ${JSON.stringify(examples)};`;
      },
      transform(code, id) {
        const file = id.split('?')[0];
        // Vite's JSON plugin receives this exact configuration before converting
        // it to JS, so runtime code uses the same reviewed, prefixed assets.
        if (file === brandFile) {
          const config = JSON.parse(code);
          for (const field of brandFields) config[field] = `${embeddedBase}${brand[field].slice(1)}`;
          brandRewritten = true;
          return { code: JSON.stringify(config), map: null };
        }
        if (/\.css$/.test(file)) return code.replaceAll('https://cdn.openai.com/common/fonts/katex/', `${embeddedBase}fonts/`).replace(/url\((['"]?)\/(art|brand|fonts|icons)\//g, `url($1${embeddedBase}$2/`);
        if (!file.startsWith(`${productRoot}${path.sep}`) && !file.startsWith(path.join(root, 'shared') + path.sep)) return;
        if (!/\.(?:m?js|tsx?)$/.test(file)) return;
        const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const edits = []; let storage = false, conversationScroll = false;
        function visit(node) {
          // Include template heads: provider icons and spot illustrations use
          // dynamic filenames, so rewriting only quoted literals misses them.
          if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) {
            const start = node.getStart(source) + 1;
            if (/^\/(art|brand|fonts|icons)\//.test(node.text) && code[start] === '/') edits.push({ start, end: start + 1, text: embeddedBase });
            // Inline style templates have url('/icons/...') before their first
            // interpolation. Rewrite just that URL, never arbitrary prose.
            const raw = node.getText(source);
            for (const match of raw.matchAll(/url\((?:\\?['"])?(\/(?:art|brand|fonts|icons)\/)/g)) {
              const slash = node.getStart(source) + match.index + match[0].length - match[1].length;
              edits.push({ start: slash, end: slash + 1, text: embeddedBase });
            }
          }
          if (file === path.join(productRoot, 'AssistantWorkspace.tsx') && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'scrollIntoView' && node.expression.expression.getText(source) === 'endRef.current') {
            edits.push({ start: node.getStart(source), end: node.end, text: `__website_scrollConversationEnd(endRef.current, ${node.arguments[0]?.getText(source) || '{}'})` }); conversationScroll = true; return;
          }
          if (ts.isPropertyAccessExpression(node) && ['window', 'globalThis'].includes(node.expression.getText(source)) && ['localStorage', 'sessionStorage'].includes(node.name.text)) {
            edits.push({ start: node.getStart(source), end: node.end, text: `__website_${node.name.text}` }); storage = true; return;
          }
          if (ts.isIdentifier(node) && ['localStorage', 'sessionStorage'].includes(node.text) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
            edits.push({ start: node.getStart(source), end: node.end, text: `__website_${node.text}` }); storage = true;
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
        for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
        if (storage) code = `import {localStorage as __website_localStorage, sessionStorage as __website_sessionStorage} from ${JSON.stringify(isolatedStorage)};\n${code}`;
        if (conversationScroll) code = `import {scrollConversationEnd as __website_scrollConversationEnd} from ${JSON.stringify(path.join(directory, 'src/embed/scroll.mjs'))};\n${code}`;
        return code;
      },
      transformIndexHtml: { order: 'post', handler: () => [{ tag: 'style', attrs: { 'data-product-layers': '' }, children: '@layer properties, theme, base, components, utilities;', injectTo: 'head-prepend' }] },
      generateBundle(_options, bundle) {
        for (const asset of Object.values(bundle)) if (asset.type === 'asset' && asset.fileName.endsWith('.css') && typeof asset.source === 'string') asset.source = asset.source.replaceAll('https://cdn.openai.com/common/fonts/katex/', `${embeddedBase}fonts/`).replace(/url\((['"]?)\/(art|brand|fonts|icons)\//g, `url($1${embeddedBase}$2/`);
      },
    }, tailwindcss()],
    build: { outDir, emptyOutDir: false, sourcemap: false, chunkSizeWarningLimit: 2000, rollupOptions: { input: path.join(directory, 'embed.html') } },
  });
  // Confirm the network boundary survives bundling, before the site manifest.
  if (!brandRewritten) throw new Error('The embedded brand configuration was not rewritten.');
  for (const field of brandFields) if (!(await lstat(path.join(outDir, brand[field].slice(1)))).isFile()) throw new Error(`Embedded brand asset was not emitted: ${field}`);
  const html = await readFile(path.join(outDir, 'embed.html'), 'utf8');
  if (!html.includes("connect-src 'none'")) throw new Error('Embedded product is missing its network isolation policy.');
  const files = await readdir(path.join(outDir, 'assets'));
  for (const name of files.filter(name => name.endsWith('.js'))) {
    const code = await readFile(path.join(outDir, 'assets', name), 'utf8');
    if (brandFields.some(field => code.includes(JSON.stringify(brand[field])) || code.includes(`'${brand[field]}'`))) throw new Error('An unprefixed JSON brand asset entered the embedded product bundle.');
    if (/['"`]\/(?:art|brand|fonts|icons)\//.test(code)) throw new Error('An unprefixed public asset entered the embedded product bundle.');
    if (code.includes('The local service returned an unreadable response.')) throw new Error('The production API implementation entered the website product bundle.');
  }
}
