import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const runtimeFile = /\.(?:mjs|cjs|js|json|ts|css)$/;

/** Identical installed code has the same identity, independent of its location. */
export function computeRuntimeRevision(root = project) {
  const hash = createHash('sha256').update('secondu-runtime-revision:1\n');
  const add = (name, bytes) => hash.update(`${name}\0${bytes.byteLength}\0`).update(bytes);
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  // The desktop package intentionally omits dependencies, scripts and development metadata.
  add('package-protocol', Buffer.from(JSON.stringify({ name: manifest.name, version: manifest.version, type: manifest.type })));
  function visit(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile() && runtimeFile.test(entry.name)) add(name, readFileSync(path.join(root, name)));
    }
  }
  visit('server'); visit('shared');
  // A reused server also serves its own UI. Vite's entry contains the hashed JS/CSS names.
  const entry = path.join(root, 'dist/index.html');
  add('client-entry', existsSync(entry) ? readFileSync(entry) : Buffer.from('not-built'));
  return hash.digest('hex');
}

// Captured once at process startup; editing files cannot make an old running server look new.
export const runtimeRevision = computeRuntimeRevision();
