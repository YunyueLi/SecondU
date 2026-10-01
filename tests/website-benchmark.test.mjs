import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile,cp,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {copyBenchmarkAssets} from '../website/build-benchmark.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));

test('website benchmark evidence is byte-identical JSON with only explicit public files',async()=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'secondu-site-benchmark-'));
 try{
  const source=path.join(temporary,'source'),run=path.join(source,'2026-10-01'),output=path.join(temporary,'output');
  await mkdir(source,{recursive:true});await cp(path.join(root,'benchmarks/results/2026-10-01'),run,{recursive:true});
  await writeFile(path.join(run,'local-events.jsonl'),'not public');
  await copyBenchmarkAssets({sourceDirectory:source,outputDirectory:output});
  const published=path.join(output,'benchmark/2026-10-01');
  assert.deepEqual((await readdir(published)).sort(),['inputs.json','model-results.json','review.html','review.json']);
  for(const name of ['inputs.json','model-results.json','review.json'])assert.deepEqual(await readFile(path.join(published,name)),await readFile(path.join(run,name)));
  assert.match(await readFile(path.join(published,'review.html'),'utf8'),/https:\/\/github.com\/YunyueLi\/SecondU\/blob\/main\/docs\/CONTEXT-BENCHMARK.md/);
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('website benchmark refuses tampered evidence and symlink substitutions',async()=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'secondu-site-benchmark-'));
 try{
  const source=path.join(temporary,'source'),run=path.join(source,'2026-10-01'),output=path.join(temporary,'output');
  await mkdir(source,{recursive:true});await cp(path.join(root,'benchmarks/results/2026-10-01'),run,{recursive:true});
  await writeFile(path.join(run,'inputs.json'),JSON.stringify({fixture:{synthetic:true},tampered:true}));
  await assert.rejects(copyBenchmarkAssets({sourceDirectory:source,outputDirectory:output}),/hash mismatch/);
  await rm(path.join(run,'inputs.json'));await symlink(path.join(root,'benchmarks/results/2026-10-01/inputs.json'),path.join(run,'inputs.json'));
  await assert.rejects(copyBenchmarkAssets({sourceDirectory:source,outputDirectory:output}),/regular file/);
 }finally{await rm(temporary,{recursive:true,force:true});}
});


test('formal website evidence preserves the frozen plan and all recorded calls',async()=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'secondu-site-benchmark-v2-'));
 try{
  await copyBenchmarkAssets({sourceDirectory:path.join(root,'benchmarks/results'),outputDirectory:temporary});
  const source=path.join(root,'benchmarks/results/2026-10-01-v2'),published=path.join(temporary,'benchmark/2026-10-01-v2');
  assert.deepEqual((await readdir(published)).sort(),['inputs.json','model-results.json','plan.json','review.json']);
  for(const name of ['inputs.json','model-results.json','plan.json','review.json'])assert.deepEqual(await readFile(path.join(published,name)),await readFile(path.join(source,name)));
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('formal presentation retains failed calls, null usage and exact original replies',async()=>{
 const {adaptBenchmarkV2}=await import('../website/src/benchmark-v2.ts');
 const source=path.join(root,'benchmarks/results/2026-10-01-v2');
 const inputs=JSON.parse(await readFile(path.join(source,'inputs.json'),'utf8')),review=JSON.parse(await readFile(path.join(source,'review.json'),'utf8'));
 const data=adaptBenchmarkV2(inputs,review);
 assert.equal(data.results.length,144);assert.equal(data.completed,143);assert.deepEqual(data.comparisonModes,['raw_retrieval','structured']);
 for(const row of review.rows){
  const result=data.results.find(item=>item.id===row.id),input=inputs.cases.find(item=>item.id===row.caseId).inputs.find(item=>item.mode===row.mode);
  assert.equal(result.output,row.output??'');assert.equal(result.context,input.context);assert.equal(result.repetition,row.repetition);assert.equal(result.status,row.status);
 }
 const timeout=data.results.find(item=>item.id==='r04--structured--r2--a1');
 assert.equal(timeout.status,'timeout');assert.equal(timeout.inputTokens,null);assert.equal(timeout.outputTokens,null);assert.equal(timeout.output,'');assert.match(timeout.failureExplanation.en,/not attributable to retrieval quality/);
 const malformed=data.results.find(item=>item.id==='l04--no_context--r2--a1');
 assert.equal(malformed.status,'completed');assert.match(malformed.failureExplanation.en,/unmodified output/);assert.throws(()=>JSON.parse(malformed.output));
 assert.deepEqual(data.comparisons.find(item=>item.id==='decision').cells.map(item=>[item.numerator,item.denominator]),[[48,48],[43,48]]);
 assert.deepEqual(data.comparisons.find(item=>item.id==='constraints').cells.map(item=>[item.numerator,item.denominator]),[[36,36],[32,36]]);
 assert.equal(data.paired.categories.reduce((sum,item)=>sum+item.count,0),24);
});
