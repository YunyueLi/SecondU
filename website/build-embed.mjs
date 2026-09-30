import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import ts from 'typescript';
import path from 'node:path';
import { mkdir, cp, readFile, readdir, lstat } from 'node:fs/promises';

/** Build the real product App with a website-only in-memory adapter. */
export async function buildEmbeddedProduct({ root, output, base }) {
  const directory = path.join(root, 'website');
  const productRoot = path.join(root, 'src');
  const apiSource = path.join(productRoot, 'api');
  const apiAdapter = path.join(directory, 'src/embed/api.ts');
  const isolatedStorage = path.join(directory, 'src/embed/storage.ts');
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
        if (importer && source.startsWith('.') && path.resolve(path.dirname(importer.split('?')[0]), source).replace(/\.tsx?$/, '') === apiSource) return apiAdapter;
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
        const edits = []; let storage = false;
        function visit(node) {
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
        return code.replace(/(['"])\/(art|brand|fonts|icons)\//g, `$1${embeddedBase}$2/`);
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
    if (code.includes('The local service returned an unreadable response.')) throw new Error('The production API implementation entered the website product bundle.');
  }
}
