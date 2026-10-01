import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runContextSuite} from '../benchmarks/context/suite.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--output'))throw new Error('Usage: node scripts/benchmark-context.mjs [--output directory]');
const directory=path.resolve(root,args[1]??'.local/context-benchmark');
const report=runContextSuite();mkdirSync(directory,{recursive:true});
writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# Synthetic personal-context benchmark','','Offline contract checks only. Model inference has not run.','',`Passed ${report.summary.passed} of ${report.summary.checks} checks across ${report.summary.cases} cases.`, '', '| Case | Condition | Relevant statements | Candidate exposed | Unrelated canary exposed | Input characters |','| --- | --- | --- | --- | --- | --- |'];
for(const row of report.cases)for(const input of row.inputs){const m=input.metrics;lines.push(`| ${row.id} | ${input.mode} | ${m.relevantStatementsPresent}/${m.relevantStatementsTotal} | ${m.candidateCanaryExposed} | ${m.unrelatedCanaryExposed} | ${input.inputChars} |`);}
lines.push('','Character counts are not token counts. Retrieval checks are not model-answer quality scores.','');
writeFileSync(path.join(directory,'report.md'),lines.join('\n'));
console.log(JSON.stringify({report:path.join(directory,'report.json'),passed:report.summary.passed,checks:report.summary.checks,modelEvaluation:'not_run'}));
if(report.summary.passed!==report.summary.checks)process.exitCode=1;
