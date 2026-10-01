import test from 'node:test';
import assert from 'node:assert/strict';
import {runContextSuite,fixture} from '../benchmarks/context/suite.mjs';

test('synthetic benchmark follows confirmed correction and new-task transfer without promoting a one-time request',()=>{
  const report=runContextSuite();assert.equal(report.summary.passed,report.summary.checks);assert.equal(report.cases.length,4);assert.equal(report.modelEvaluation.status,'not_run');assert.equal(report.modelEvaluation.qualityScore,null);
  const [initial,changed,exception,transfer]=report.cases;assert.equal(initial.expectedPreferenceRevision,2);assert.equal(changed.expectedPreferenceRevision,3);assert.equal(transfer.expectedPreferenceRevision,3);assert.notEqual(initial.packageRevision,changed.packageRevision);
  assert.equal(exception.inputs.find(item=>item.mode==='structured').context.includes(fixture.exception),false);assert.equal(exception.prompt.includes(fixture.exception),true);assert.equal(transfer.prompt.includes(fixture.exception),false);
  assert.equal(transfer.inputs.find(item=>item.mode==='structured').metrics.relevantStatementsPresent,2);assert.equal(transfer.inputs.find(item=>item.mode==='raw_archive').metrics.candidateCanaryExposed,true);
});

test('all evaluation conditions share the exact task and instructions; off includes no profile and no output is fabricated',()=>{
  const report=runContextSuite();for(const row of report.cases){assert.equal(new Set(row.inputs.map(input=>input.system)).size,1);for(const input of row.inputs)assert.ok(input.user.endsWith(`Task:\n${row.prompt}`));const off=JSON.parse(row.inputs.find(input=>input.mode==='no_context').context);assert.equal(off.profile,undefined);assert.equal(off.facts.length,0);}
  assert.deepEqual(report.modelEvaluation.outputs,[]);assert.equal(report.fixture.synthetic,true);
});
