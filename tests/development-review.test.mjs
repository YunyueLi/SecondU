import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,utimesSync,symlinkSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {createDevelopmentReader} from '../server/development-review.mjs';

function metadata(){return {schemaVersion:1,baselineCommit:'fa7baf4',title:'Fixture review',summary:'Recorded implementation, with bounded evidence.',stages:[{id:'build',title:'Build',summary:'Fixture state.',status:'documented',document:'DEVELOPMENT.md'}],iterations:[],capabilities:[],evidence:[],boundaries:[]};}
async function fixture(t,{packaged=false}={}){
  const root=mkdtempSync(path.join(os.tmpdir(),'secondu-review-')),project=path.join(root,'product');mkdirSync(path.join(project,'docs'),{recursive:true});
  writeFileSync(path.join(project,'package.json'),JSON.stringify({hitherPackaged:packaged}));
  writeFileSync(path.join(project,'docs/DEVELOPMENT.md'),'# Fixture development\n\nFirst recorded change.\n');
  writeFileSync(path.join(project,'docs/ITERATION.md'),'# Fixture iteration\n\nPending UI verification.\n');
  writeFileSync(path.join(project,'docs/review.json'),JSON.stringify(metadata()));
  const app=createApp({dataDir:path.join(root,'data'),developmentRoot:project,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
  const api=async(route,options={})=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,options);return {status:response.status,headers:response.headers,value:await response.json()};};
  return {root,project,app,api,writeDocument(content){writeFileSync(path.join(project,'docs/DEVELOPMENT.md'),content);},writeReview(value){writeFileSync(path.join(project,'docs/review.json'),JSON.stringify(value));}};
}

test('review and canonical documents refresh without rebuilding, and unchanged contents retain their revision',async t=>{
  const f=await fixture(t),before=await f.api('development/review');assert.equal(before.status,200);assert.equal(before.headers.get('cache-control'),'no-store');
  assert.equal(before.value.source.kind,'workspace');assert.match(before.value.revision,/^[a-f0-9]{64}$/);assert.ok(Number.isFinite(Date.parse(before.value.updatedAt)));
  assert.deepEqual(before.value.documents.map(item=>item.path),['DEVELOPMENT.md','ITERATION.md']);assert.equal((await f.api('development/review')).value.revision,before.value.revision);
  const oldStat=statSync(path.join(f.project,'docs/DEVELOPMENT.md'));
  f.writeDocument('# Fixture development\n\nSecond recorded change, still pending.\n');
  utimesSync(path.join(f.project,'docs/DEVELOPMENT.md'),oldStat.atime,oldStat.mtime);
  const after=await f.api('development/review');assert.notEqual(after.value.revision,before.value.revision);assert.ok(after.value.updatedAt>=before.value.updatedAt);
  const document=await f.api('development/documents?path=DEVELOPMENT.md');assert.equal(document.status,200);assert.match(document.value.content,/Second recorded change/);assert.equal(document.value.revision,after.value.documents[0].revision);
  const next=metadata();next.summary='The explicitly tracked review was updated.';f.writeReview(next);assert.equal((await f.api('development/review')).value.summary,next.summary);
  const saved=readFileSync(path.join(f.project,'docs/DEVELOPMENT.md'),'utf8');
  assert.equal((await f.api('development/documents?path=DEVELOPMENT.md',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'Unauthorized write'})})).status,405);
  assert.equal(readFileSync(path.join(f.project,'docs/DEVELOPMENT.md'),'utf8'),saved);
  assert.equal((await f.api('development/review',{headers:{Origin:'https://untrusted.invalid'}})).status,403);
});

test('document allowlist rejects traversal, absolute paths, local records and unknown endpoints',async t=>{
  const f=await fixture(t);writeFileSync(path.join(f.root,'private.txt'),'synthetic-private-record');writeFileSync(path.join(f.project,'docs/PRIVATE.md'),'synthetic-private-record');
  for(const target of ['../private.txt',path.join(f.root,'private.txt'),'PRIVATE.md','.local/log.txt','review.json','revision-02/../../private.txt','DEVELOPMENT.md/../PRIVATE.md','DEVELOPMENT.md\0']){
    const result=await f.api('development/documents?path='+encodeURIComponent(target));assert.equal(result.status,404,target);assert.doesNotMatch(JSON.stringify(result.value),/synthetic-private-record|secondu-review-/);
  }
  assert.equal((await f.api('development/documents')).status,404);assert.equal((await f.api('development/documents/DEVELOPMENT.md')).status,404);
});

test('allowed filenames cannot follow file or directory symlinks outside the product docs',async t=>{
  const f=await fixture(t),external=path.join(f.root,'external');mkdirSync(external);writeFileSync(path.join(external,'PRIVATE.md'),'synthetic-private-record');writeFileSync(path.join(external,'BRIEF.md'),'synthetic-private-record');
  symlinkSync(path.join(external,'PRIVATE.md'),path.join(f.project,'docs/PRODUCT.md'));
  for(const route of ['development/documents?path=PRODUCT.md','development/review']){const result=await f.api(route);assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.value),/synthetic-private-record|secondu-review-/);}
  symlinkSync(external,path.join(f.project,'docs/revision-02'));
  assert.equal((await f.api('development/documents?path=revision-02%2FBRIEF.md')).status,503);
});

test('review metadata rejects broken source references and invented evidence identifiers',async t=>{
  const f=await fixture(t),first=metadata();first.stages[0].document='PRIVATE.md';f.writeReview(first);assert.equal((await f.api('development/review')).status,503);
  const second=metadata();second.capabilities=[{id:'capability',title:'Capability',summary:'Fixture',status:'verified',evidence:['unrecorded-proof']}];f.writeReview(second);assert.equal((await f.api('development/review')).status,503);
  const third=metadata();third.stages[0].status='all_complete';f.writeReview(third);assert.equal((await f.api('development/review')).status,503);
});

test('packaged review reads the same fixed documents from its package root and stays local',async t=>{
  const f=await fixture(t,{packaged:true});const snapshot=await f.api('development/review');assert.equal(snapshot.value.source.kind,'packaged');assert.equal(snapshot.value.source.refresh,'local-files');
  assert.equal(snapshot.value.title,'Fixture review');assert.equal((await f.api('development/documents?path=DEVELOPMENT.md')).value.title,'Fixture development');
  assert.equal((await f.api('spaces/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);
  assert.equal((await f.api('spaces/personal/development/review')).value.revision,snapshot.value.revision);
  f.writeDocument('# Bundled update\n\nPackage-local canonical content.\n');
  assert.equal((await f.api('spaces/personal/development/documents?path=DEVELOPMENT.md')).value.title,'Bundled update');
  f.writeDocument('x'.repeat(1024*1024+1));assert.equal((await f.api('development/review')).status,503);
});

test('checked-in review references only available canonical documents and evidence',()=>{
  const snapshot=createDevelopmentReader().review();assert.ok(snapshot.stages.length);assert.ok(snapshot.iterations.length);assert.ok(snapshot.capabilities.length);assert.ok(snapshot.evidence.length);assert.ok(snapshot.boundaries.length);
  assert.ok(snapshot.documents.some(document=>document.path==='DEVELOPMENT.md'));assert.equal(snapshot.source.kind,'workspace');
});

test('milestone timestamps remain ordered and reference an actual iteration and commit identity',async t=>{
  const f=await fixture(t),value=metadata();
  value.iterations=[{id:'first',date:'2026-09-29',title:'First build',summary:'Fixture milestone.',status:'documented'}];
  value.milestones=[{id:'first-commit',at:'2026-09-29T12:50:01+08:00',title:'First build',detail:'Fixture commit reference.',commit:'50d5e1f',iteration:'first'}];
  f.writeReview(value);assert.deepEqual((await f.api('development/review')).value.milestones,value.milestones);
  for(const patch of [{commit:'not-a-commit'},{iteration:'missing'},{at:'2026-09-29 12:50:01'}]){
    f.writeReview({...value,milestones:[{...value.milestones[0],...patch}]});assert.equal((await f.api('development/review')).status,503);
  }
  f.writeReview({...value,milestones:[value.milestones[0],{...value.milestones[0],id:'earlier',at:'2026-09-28T12:50:01+08:00'}]});
  assert.equal((await f.api('development/review')).status,503);
});

test('local progress is bilingual, bounded and cannot impersonate a commit or release',async t=>{
  const f=await fixture(t),value=metadata();
  value.iterations=[{id:'current',date:'2026-10-01',title:'Current work',summary:'Local work still under review.',status:'in_progress'}];
  const current={id:'current-round',date:'2026-10-01',status:'in_progress',title:'本轮',titleEn:'Current round',summary:'本地进度。',summaryEn:'Local progress.',completed:[{zh:'专项通过。',en:'Targeted checks passed.'}],pending:[{zh:'最终界面。',en:'Final UI review.'}],iteration:'current'};
  value.currentProgress=current;f.writeReview(value);assert.deepEqual((await f.api('development/review')).value.currentProgress,current);
  for(const patch of [{commit:'c7e8803'},{at:'2026-10-01T12:00:00+08:00'},{release:'v0.1.2'},{status:'verified'},{iteration:'missing'},{titleEn:''},{completed:Array(7).fill({zh:'过多',en:'Too many'})},{pending:[{zh:'缺少英文'}]}]){
    f.writeReview({...value,currentProgress:{...current,...patch}});assert.equal((await f.api('development/review')).status,503,JSON.stringify(patch));
  }
});

test('published release metadata keeps its own publication time and canonical release link',async t=>{
  const f=await fixture(t),value=metadata();
  const release={version:'v0.1.1',publishedAt:'2026-09-30T20:43:35Z',commit:'eceaee7e1ecb4d23865f6ecee47722a7013d2942',url:'https://github.com/YunyueLi/SecondU/releases/tag/v0.1.1'};
  value.latestRelease=release;f.writeReview(value);assert.deepEqual((await f.api('development/review')).value.latestRelease,release);
  for(const patch of [{isDraft:true},{publishedAt:'2026-99-99'},{url:'https://untrusted.invalid/v0.1.1'},{url:'https://github.com/YunyueLi/SecondU/releases/tag/v0.1.2'},{commit:'uncommitted'}]){
    f.writeReview({...value,latestRelease:{...release,...patch}});assert.equal((await f.api('development/review')).status,503,JSON.stringify(patch));
  }
});
