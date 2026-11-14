import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../server/store.mjs';
import { LibraryService } from '../server/library.mjs';
import { parseLibraryFile } from '../server/library-parser.mjs';

const marker = 'precisemarker987';
if (process.argv[2] === '--worker') {
  const [mode, directory] = process.argv.slice(3), store = new Store(path.join(directory, 'data'), { seed: false });
  const started = performance.now(); let found, library;
  if (mode === 'eager_sources') found = store.list('sources').filter(source => source.text.includes(marker)).length;
  else { library = new LibraryService(store, { automatic: false }); found = library.search({ query: marker }).items.length; }
  const result = { mode, elapsedMs: performance.now() - started, peakRssMiB: process.resourceUsage().maxRSS / 1024, found };
  if (library) await library.close(); store.close(); console.log(JSON.stringify(result));
} else {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'secondu-library-scale-'))), files = path.join(directory, 'Fictional'); await mkdir(files);
  const store = new Store(path.join(directory, 'data'), { seed: false });
  const library = new LibraryService(store, { automatic: false, parse: parseLibraryFile });
  const count = 768, size = 128 * 1024;
  try {
    for (let i = 0; i < count; i++) {
      const text = `Fictional record ${i}. ${i === count - 1 ? marker : 'ordinary note'}\n` + 'Fictional field notes about trees and clouds. '.repeat(Math.ceil(size / 44)).slice(0, size);
      await writeFile(path.join(files, `fiction-${i}.txt`), text);
      store.put('sources', { id: `fiction-${i}`, title: `Fictional ${i}`, kind: 'document', text, demo: true });
    }
    const start = performance.now(); await library.register({ path: files }); await library.settled();
    if (library.roots()[0].status !== 'idle') throw new Error('Scale corpus did not index completely');
    const indexingMs = performance.now() - start; await library.close(); store.close();
    const samples = [];
    for (let repeat = 0; repeat < 3; repeat++) for (const mode of repeat % 2 ? ['indexed', 'eager_sources'] : ['eager_sources', 'indexed']) {
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', mode, directory], { encoding: 'utf8' });
      if (child.status !== 0) throw new Error(`Scale child failed: ${child.stderr.slice(-1000)}`);
      const sample = JSON.parse(child.stdout); if (sample.found !== 1) throw new Error('The two strategies did not locate the same marker'); samples.push(sample);
    }
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const summary = ['eager_sources', 'indexed'].map(mode => ({ mode, medianMs: median(samples.filter(s => s.mode === mode).map(s => s.elapsedMs)), medianPeakRssMiB: median(samples.filter(s => s.mode === mode).map(s => s.peakRssMiB)) }));
    const report = { synthetic: true, measuredAt: new Date().toISOString(), documents: count, approximateTextMiB: count * size / 1024 / 1024, indexingMs, repetitions: 3, summary, samples,
      scope: 'Isolated fresh-process local query comparison at 96 MiB text, reproducing eager source loading versus bounded indexed search. Does not measure overall application RAM, cloud answer quality, a million-message corpus, or parsing worker peak memory.' };
    if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
  } finally { if (!library.closed) { await library.close(); store.close(); } await rm(directory, { recursive: true, force: true }); }
}
