// Retrieval-only comparison: no LLM answers, no real user records, no vendor scores.
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { LibraryService } from '../server/library.mjs';
import { parseLibraryFile } from '../server/library-parser.mjs';
import { documents, cases } from '../benchmarks/library-cases.mjs';

const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'secondu-library-benchmark-')));
const store = new Store(path.join(directory, 'data'), { seed: false });
// In-process parsing keeps this query comparison independent of worker startup.
const library = new LibraryService(store, { automatic: false, parse: parseLibraryFile });
const sources = [...documents, ...Array.from({ length: 1000 }, (_, i) => [`背景/虚构观察-${i}.txt`, `虚构无关材料 ${i}。观察花朵、河流和天气；没有记录任何项目决策。`.repeat(20)])];
try {
  const files = path.join(directory, 'Fictional corpus'); await mkdir(files);
  for (const [name, text] of sources) { await mkdir(path.dirname(path.join(files, name)), { recursive: true }); await writeFile(path.join(files, name), text); }
  const started = performance.now(); await library.register({ path: files }); await library.settled();
  if (library.lastError || library.roots()[0].status !== 'idle') throw new Error('Corpus did not index completely');
  const indexingMs = performance.now() - started;
  const strategies = {
    // Emulates whole-string substring matching in the former connector, but
    // materializes this already loaded synthetic array: no RAM comparison claim.
    substring: query => sources.filter(([name, text]) => `${name}\n${text}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12).map(([name, text]) => ({ path: name, excerpt: text.slice(0, 1200) })),
    indexed: query => library.search({ query, pageSize: 12 }).items,
    indexed_with_context: query => library.search({ query, pageSize: 12 }).items.map(item => ({ ...item, excerpt: library.read(item.id, { revision: item.revision, offset: Math.max(0, item.ordinal - 1), pageSize: 3 }).items.map(chunk => chunk.text).join('\n') })),
  };
  const results = [];
  for (const sample of cases) for (const [strategy, retrieve] of Object.entries(strategies)) {
    const start = performance.now(), retrieved = retrieve(sample.query), latencyMs = performance.now() - start;
    // Identical final evidence budget; document labels/citations also count.
    const evidence = []; let used = 0;
    for (const item of retrieved) { const entry = { path: item.path, text: item.excerpt }; const size = JSON.stringify(entry).length; if (used + size > 8000) continue; evidence.push(entry); used += size; }
    const paths = new Set(evidence.map(item => item.path)), text = evidence.map(item => item.text).join('\n');
    results.push({ caseId: sample.id, strategy, latencyMs, evidenceChars: used, evidencePaths: [...paths],
      sourceRecall: sample.gold.length ? sample.gold.filter(name => paths.has(name)).length / sample.gold.length : null,
      quoteRecall: sample.quotes.length ? sample.quotes.filter(quote => text.includes(quote)).length / sample.quotes.length : null,
      noResultWhenAbsent: sample.gold.length ? null : !evidence.length });
  }
  const summary = Object.keys(strategies).map(strategy => {
    const rows = results.filter(row => row.strategy === strategy), scores = rows.filter(row => row.sourceRecall !== null);
    return { strategy, sourceRecall: scores.reduce((sum, row) => sum + row.sourceRecall, 0) / scores.length,
      quoteRecall: scores.reduce((sum, row) => sum + row.quoteRecall, 0) / scores.length,
      meanMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length,
      completeEvidenceCases: scores.filter(row => row.sourceRecall === 1 && row.quoteRecall === 1).length, answerQualityMeasured: false };
  });
  const code = await Promise.all(['server/library.mjs', 'server/library-text.mjs', 'benchmarks/library-cases.mjs', 'scripts/benchmark-library.mjs'].map(async name => ({ name, sha256: createHash('sha256').update(await readFile(new URL('../' + name, import.meta.url))).digest('hex') })));
  const report = { schema: 'secondu.library.retrieval-comparison.v1', synthetic: true, measuredAt: new Date().toISOString(), documents: sources.length, characters: sources.reduce((n, [, text]) => n + text.length, 0), contextBudgetChars: 8000, indexingMs, summary, results, code,
    limitations: ['Author-created ten-case regression corpus, not a public leaderboard.', 'No LLM answers or semantic/graph engine measured here.', 'Memory and query latency are not comparable to loading a real multi-gigabyte corpus.', 'All modes receive identical authored keyword queries, not gold answer text.', 'Independent model answer and larger scale evaluation remain separate requirements.'] };
  const output = process.argv[2]; if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ documents: report.documents, indexingMs, summary }, null, 2));
} finally { await library.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
