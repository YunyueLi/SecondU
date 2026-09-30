import { cp, mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') throw new Error('This packaging script targets macOS. npm run desktop works on other Electron platforms.');
await access(path.join(root, 'dist/index.html'));
const deliverable = path.join(root, 'out/Hither.app');
const output = path.join(root, `.local/package-${Date.now()}/Hither.app`);
await mkdir(path.dirname(output), { recursive: true });
await cp(path.join(root, 'node_modules/electron/dist/Electron.app'), output, { recursive: true, verbatimSymlinks: true });
const resources = path.join(output, 'Contents/Resources');
const packaged = path.join(resources, 'app');
await mkdir(packaged, { recursive: true });
for (const name of ['dist', 'server', 'desktop', 'shared', 'docs', 'README.md', 'LICENSE']) {
  await cp(path.join(root, name), path.join(packaged, name), { recursive: true });
}
await writeFile(path.join(packaged, 'package.json'), JSON.stringify({ name: 'hither-desktop', productName: 'Hither', hitherPackaged: true, version: '0.1.0', type: 'module', main: 'desktop/main.cjs' }, null, 2));
await rename(path.join(output, 'Contents/MacOS/Electron'), path.join(output, 'Contents/MacOS/Hither'));
const plist = path.join(output, 'Contents/Info.plist');
let info = await readFile(plist, 'utf8');
for (const [key, value] of Object.entries({ CFBundleExecutable: 'Hither', CFBundleDisplayName: 'Hither', CFBundleName: 'Hither', CFBundleIdentifier: 'im.hither.desktop.local', CFBundleShortVersionString: '0.1.0', CFBundleVersion: '0.1.0' })) {
  info = info.replace(new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`), `$1${value}$2`);
}
info = info.replace(/(<key>CFBundleIconFile<\/key>\s*<string>)[^<]*(<\/string>)/, '$1Hither.icns$2');
await cp(path.join(root, 'desktop/assets/Hither.icns'), path.join(resources, 'Hither.icns'));
await writeFile(plist, info);
// Local ad-hoc signing records the modified bundle; this is not Developer ID notarization.
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', output], { stdio: 'inherit' });
await mkdir(path.dirname(deliverable), { recursive: true });
if (existsSync(deliverable)) await rename(deliverable, path.join(root, `out/Hither.previous-${Date.now()}.app`));
await rename(output, deliverable);
console.log(deliverable);
