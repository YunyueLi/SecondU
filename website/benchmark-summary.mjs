import {lstat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const runDirectory = '2026-10-01-v2';
const evidenceFiles = ['inputs.json', 'plan.json', 'model-results.json', 'review.json'];
const virtualId = 'virtual:benchmark-summary';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const invariant = (condition, message) => { if (!condition) throw new Error(`Invalid benchmark summary evidence: ${message}`); };

/** Derive the small homepage payload at compile time; no trial text is emitted. */
export async function readBenchmarkSummary(sourceDirectory) {
  const directory = path.join(sourceDirectory, runDirectory);
  invariant((await lstat(directory)).isDirectory(), 'run directory');
  const files = {};
  for (const name of evidenceFiles) {
    const file = path.join(directory, name);
    invariant((await lstat(file)).isFile(), `regular file required: ${name}`);
    const bytes = await readFile(file);
    files[name] = {value: JSON.parse(bytes.toString('utf8')), hash: digest(bytes)};
  }
  const inputs = files['inputs.json'].value;
  const plan = files['plan.json'].value;
  const results = files['model-results.json'].value;
  const review = files['review.json'].value;
  invariant(inputs.schema === 'secondu.context-benchmark.v2' && inputs.fixture?.synthetic === true && inputs.fixture.pilot === false, 'synthetic v2 inputs');
  invariant(plan.schema === 'secondu.context-trial-plan.v2' && results.schema === 'secondu.context-model-run.v2' && plan.synthetic === true && results.synthetic === true && review.synthetic === true, 'synthetic run');
  invariant(plan.inputManifestSha256 === files['inputs.json'].hash && results.inputManifestSha256 === files['inputs.json'].hash && results.planSha256 === files['plan.json'].hash, 'frozen input and plan hashes');
  invariant(review.schema === 'secondu.context-review.v2' && review.finishedAt && review.audit?.valid === true, 'completed audited review');
  for (const [file, key] of [['inputs.json', 'inputsSha256'], ['plan.json', 'planSha256'], ['model-results.json', 'resultsSha256']]) {
    invariant(review.evidence?.[key] === files[file].hash, `hash mismatch: ${file}`);
  }
  const cases = new Map(inputs.cases.map(item => [item.id, item]));
  invariant(cases.size === inputs.cases.length, 'duplicate case');
  const conditions = inputs.protocol.conditions;
  const repetitions = inputs.protocol.repetitions;
  invariant(Number.isInteger(repetitions) && repetitions > 0 && conditions.includes('structured'), 'conditions and repetitions');
  const expected = new Map(inputs.cases.flatMap(item => conditions.flatMap(mode => Array.from({length: repetitions}, (_, index) => {
    const repetition = index + 1;
    return [`${item.id}--${mode}--r${repetition}--a1`, {caseId: item.id, capabilityId: item.capabilityId, mode, repetition, attempt: 1}];
  }))));
  const byId = (rows, label) => {
    invariant(Array.isArray(rows), `${label} rows`);
    const indexed = new Map(rows.map(row => [row.id, row]));
    invariant(indexed.size === expected.size && rows.length === expected.size, `${label} trial coverage`);
    for (const [id, identity] of expected) {
      const row = indexed.get(id);
      invariant(row && Object.entries(identity).every(([key, value]) => row[key] === value), `${label} trial identity: ${id}`);
    }
    return indexed;
  };
  byId(plan.trials, 'plan');
  const recorded = byId(results.outputs, 'results');
  byId(review.rows, 'review');
  for (const row of review.rows) {
    invariant(row.status === recorded.get(row.id).status, `status: ${row.id}`);
    invariant(typeof row.judgement?.decisionCorrect === 'boolean', `decision judgement: ${row.id}`);
    invariant(!row.judgement.decisionCorrect || row.status === 'completed' && row.judgement.schemaValid === true, `successful decision: ${row.id}`);
  }
  const count = rows => ({numerator: rows.filter(row => row.judgement.decisionCorrect).length, denominator: rows.length});
  const structured = review.rows.filter(row => row.mode === 'structured');
  const decision = count(structured);
  const aggregate = review.summary.byMode.find(item => item.mode === 'structured');
  invariant(decision.numerator === aggregate.decisionCorrect && decision.denominator === aggregate.decisionDenominator, 'decision aggregate');
  const capabilities = inputs.capabilities.map(group => {
    const rows = structured.filter(row => cases.get(row.caseId).capabilityId === group.id);
    const decision = count(rows);
    const aggregate = review.capabilities.find(item => item.id === group.id)?.byMode.find(item => item.mode === 'structured');
    invariant(decision.denominator > 0 && decision.numerator === aggregate?.decisionCorrect && decision.denominator === aggregate?.decisionDenominator, `capability aggregate: ${group.id}`);
    return {id: group.id, title: {zh: group.title, en: group.titleEn}, decision};
  });
  invariant(capabilities.reduce((sum, group) => sum + group.decision.denominator, 0) === structured.length, 'capability coverage');
  const completed = review.rows.filter(row => row.status === 'completed').length;
  invariant(expected.size === review.summary.planned && completed === review.summary.completed, 'run totals');
  return {
    version: 'v2', directory: runDirectory, caseCount: cases.size, planned: expected.size, completed, repetitions, decision, capabilities,
    evidence: Object.fromEntries(evidenceFiles.map(name => [name, files[name].hash])),
  };
}

/** Compile the verified summary into the site; browsers never fetch its sources. */
export function benchmarkSummaryPlugin({sourceDirectory}) {
  return {
    name: 'benchmark-homepage-summary',
    resolveId(id) { if (id === virtualId) return `\0${virtualId}`; },
    async load(id) {
      if (id !== `\0${virtualId}`) return;
      for (const name of evidenceFiles) this.addWatchFile(path.join(sourceDirectory, runDirectory, name));
      return `export default ${JSON.stringify(await readBenchmarkSummary(sourceDirectory))};`;
    },
  };
}
