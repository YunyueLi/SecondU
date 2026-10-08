import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** An exact public asset allowlist; never copy the website public directory. */
export async function copyShareCard({ root, output }) {
  const project = await realpath(root);
  const directory = path.join(project, 'website/public/assets');
  const source = path.join(directory, 'secondu-share.jpg');
  const provenance = path.join(directory, 'secondu-share.provenance.json');
  for (const file of [source, provenance]) {
    if (!(await lstat(file)).isFile() || await realpath(file) !== file) throw new Error('Share card inputs must be regular public files.');
  }
  const bytes = await readFile(source);
  const manifest = JSON.parse(await readFile(provenance, 'utf8'));
  if (manifest.file !== 'secondu-share.jpg' || manifest.privateInputs !== false || manifest.width !== 1200 || manifest.height !== 630 || manifest.bytes !== bytes.length || manifest.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw new Error('Share card provenance or image hash does not match the reviewed asset.');
  }
  await mkdir(path.join(output, 'assets'), { recursive: true });
  await writeFile(path.join(output, 'assets/secondu-share.jpg'), bytes);
  await writeFile(path.join(output, 'assets/secondu-share.provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
}
