import { readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const names = ['understanding', 'growth', 'devices', 'capabilities', 'relationships'].map(name => `${name}-v1`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Publish only the reviewed artwork provenance. The artwork build derives the
 * imported website images; validate their original bytes before retaining records. */
export async function copyRoadmapProvenance({ sourceDirectory, outputDirectory }) {
  async function read(name) {
    const file = path.join(sourceDirectory, name);
    if (!(await lstat(file)).isFile()) throw new Error('Roadmap provenance requires regular files.');
    return readFile(file);
  }
  const manifestBytes = await read('manifest.json'), manifest = JSON.parse(manifestBytes);
  if (manifest.assets?.length !== names.length) throw new Error('Unexpected roadmap asset count.');
  const files = new Map([['manifest.json', manifestBytes]]);
  for (const name of names) {
    const entry = manifest.assets.find(entry => entry.file === `${name}.png`);
    if (!entry || entry.promptFile !== `${name}.prompt.json`) throw new Error('Roadmap filename is not on the reviewed allowlist.');
    if (hash(await read(entry.file)) !== entry.sha256) throw new Error('Roadmap image hash mismatch.');
    const prompt = await read(entry.promptFile);
    if (hash(prompt) !== entry.promptSha256) throw new Error('Roadmap prompt hash mismatch.');
    if (JSON.parse(prompt).privateInputs !== false) throw new Error('Roadmap prompt requires reviewed public-only inputs.');
    files.set(entry.promptFile, prompt);
  }
  const destination = path.join(outputDirectory, 'art/roadmap');
  await mkdir(destination, { recursive: true });
  for (const [name, bytes] of files) await writeFile(path.join(destination, name), bytes);
  return [...files.keys()];
}
