import { cp, mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(await readFile(path.join(root,'shared/brand.json'),'utf8'));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (process.platform !== 'darwin') throw new Error('This packaging script targets macOS. npm run desktop works on other Electron platforms.');
await access(path.join(root, 'dist/index.html'));
// Electron 44 downloads its native runtime on first use, not during npm ci.
// Run its checksum-verifying installer so a clean checkout can package directly.
execFileSync(process.execPath, [path.join(root, 'node_modules/electron/install.js')], { stdio: 'inherit' });
const deliverable = path.join(root, `out/${brand.desktop.bundleName}.app`);
const output = path.join(root, `.local/package-${Date.now()}/${brand.desktop.bundleName}.app`);
await mkdir(path.dirname(output), { recursive: true });
await cp(path.join(root, 'node_modules/electron/dist/Electron.app'), output, { recursive: true, verbatimSymlinks: true });
const resources = path.join(output, 'Contents/Resources');
const packaged = path.join(resources, 'app');
await mkdir(packaged, { recursive: true });
for (const name of ['dist', 'server', 'desktop', 'shared', 'docs', 'README.md', 'README.zh-CN.md', 'QUICKSTART.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE']) {
  await cp(path.join(root, name), path.join(packaged, name), { recursive: true });
}
await writeFile(path.join(packaged, 'package.json'), JSON.stringify({ name: brand.compatibility.applicationId, productName: brand.name, [brand.compatibility.packagedFlag]: true, version, type: 'module', main: 'desktop/main.cjs' }, null, 2));
await rename(path.join(output, 'Contents/MacOS/Electron'), path.join(output, 'Contents/MacOS',brand.desktop.executable));
const plist = path.join(output, 'Contents/Info.plist');
let info = await readFile(plist, 'utf8');
for (const [key, value] of Object.entries({ CFBundleExecutable: brand.desktop.executable, CFBundleDisplayName: brand.name, CFBundleName: brand.desktop.bundleName, CFBundleIdentifier: brand.desktop.bundleIdentifier, CFBundleShortVersionString: version, CFBundleVersion: version })) {
  info = info.replace(new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`), `$1${value}$2`);
}
info = info.replace(/(<key>CFBundleIconFile<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${brand.desktop.iconFile}$2`);
await cp(path.join(root, 'desktop/assets',brand.desktop.iconFile), path.join(resources,brand.desktop.iconFile));
await writeFile(plist, info);
// Local ad-hoc signing records the modified bundle; this is not Developer ID notarization.
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', output], { stdio: 'inherit' });
await mkdir(path.dirname(deliverable), { recursive: true });
if (existsSync(deliverable)) await rename(deliverable, path.join(root, `out/${brand.desktop.bundleName}.previous-${Date.now()}.app`));
await rename(output, deliverable);
console.log(deliverable);
