import { readFile, writeFile, mkdir, cp, rm, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
import { buildEmbeddedProduct } from './build-embed.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(directory);
const output = path.join(root, process.argv.includes('--check-pages') ? '.local/acceptance/website-pages-build' : 'dist-site');
const config = JSON.parse(await readFile(path.join(directory, 'site.json'), 'utf8'));
const base = process.argv.find(value => value.startsWith('--base='))?.slice(7) || config.base;
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be an absolute safe directory prefix ending in /.');
for (const key of ['url', 'repository', 'download']) if (!/^https:\/\//.test(config[key])) throw new Error(`Expected HTTPS ${key}.`);
const typecheck = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(directory, 'tsconfig.json')], { stdio: 'inherit' });
if (typecheck.status !== 0) process.exit(typecheck.status || 1);
try {
  if ((await lstat(output)).isSymbolicLink()) throw new Error('Refusing to replace a symlinked website output.');
  const entries = await readdir(output);
  if (entries.length && !entries.includes('.site-build')) throw new Error('Refusing to replace an output directory not created by this website build.');
  await rm(output, { recursive: true, force: true });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
// Write the marker before compilation so a failed build can be retried safely.
await writeFile(path.join(output, '.site-build'), 'SecondU interactive website\n');

// Only explicitly selected public artwork is copied. Runtime data, app backend,
// local screenshots and personal API responses can never enter this asset list.
const assets = [
  ...['secondu-mark.svg', 'secondu-wordmark.svg', 'secondu-favicon.svg'].map(file => [`brand/${file}`, `assets/${file}`]),
  ...['pencil-garden.png', 'tidal-pencil.png', 'moon-voyage.png', 'background-presets.prompts.json', 'dating-first-meeting-v1.png', 'dating-first-meeting-v1.prompt.json'].map(file => [`art/${file}`, `assets/${file}`]),
  ...['pencil', 'tidal', 'night', 'plain'].flatMap(theme => [`art/themes/${theme}-atlas-v1.png`, `art/themes/${theme}-atlas-v1.prompt.json`].map(file => [file, file])),
  ['art/twin-badge-v1.png', 'art/twin-badge-v1.png'],
  ['art/twin-badge-v1.prompt.json', 'art/twin-badge-v1.prompt.json'],
];
for (const [source, target] of assets) {
  await mkdir(path.dirname(path.join(output, target)), { recursive: true });
  await cp(path.join(root, 'public', source), path.join(output, target));
}
const fontDirectory = path.join(root, 'node_modules/katex/dist/fonts');
await mkdir(path.join(output, 'fonts'), { recursive: true });
for (const name of await readdir(fontDirectory)) if (/^KaTeX_[A-Za-z0-9-]+\.woff2$/.test(name)) await cp(path.join(fontDirectory, name), path.join(output, 'fonts', name));
await mkdir(path.join(output, 'licenses'), { recursive: true });
for (const [source, name] of [
  [path.join(root, 'LICENSE'), 'SecondU-LICENSE.txt'],
  [path.join(directory, 'node_modules/three/LICENSE'), 'Three-LICENSE.txt'],
  [path.join(directory, 'node_modules/@openai/apps-sdk-ui/LICENSE'), 'Apps-SDK-UI-LICENSE.txt'],
  [path.join(root, 'node_modules/katex/LICENSE'), 'KaTeX-LICENSE.txt'],
  [path.join(root, 'docs/licenses/website-dependencies.txt'), 'website-dependencies.txt'],
  [path.join(root, 'docs/licenses/runtime-dependencies.txt'), 'runtime-dependencies.txt'],
  [path.join(root, 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md'],
]) await cp(source, path.join(output, 'licenses', name));

await build({ configFile: path.join(directory, 'vite.config.ts'), base, build: { outDir: output, emptyOutDir: false },
  plugins: [{ name: 'website-local-public-assets', enforce: 'pre', transform(code, id) {
    if (!/\.css(?:\?|$)/.test(id)) return;
    return code.replaceAll('https://cdn.openai.com/common/fonts/katex/', `${base}fonts/`).replace(/url\((['"]?)\/art\//g, `url($1${base}art/`);
  } }],
});
await buildEmbeddedProduct({ root, output, base });
// Tailwind may expand imported SDK CSS after transform. Apply the same rewrite
// to emitted CSS so math preview never loads third-party font URLs.
const built = await readdir(path.join(output, 'assets'));
for (const name of built) if (name.endsWith('.css')) {
  const file = path.join(output, 'assets', name);
  const css = await readFile(file, 'utf8');
  await writeFile(file, css.replaceAll('https://cdn.openai.com/common/fonts/katex/', `${base}fonts/`).replace(/url\((['"]?)\/art\//g, `url($1${base}art/`));
}
await writeFile(path.join(output, '.nojekyll'), '');
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.url}sitemap.xml\n`);
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.url}</loc></url></urlset>\n`);
const files = await readdir(output, { recursive: true, withFileTypes: true });
const manifest = [];
for (const item of files) if (item.isFile()) {
  const full = path.join(item.parentPath, item.name);
  const bytes = await readFile(full);
  manifest.push({ file: path.relative(output, full), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(output, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${manifest.length} website files into ${output}; base ${base}`);
