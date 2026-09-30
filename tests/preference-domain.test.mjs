import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';

async function fixture(t) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-preferences-'));
  let app;
  async function start(){app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));}
  await start();t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  return {async restart(){await app.close();await start();},async request(route,body,method=body?'POST':'GET'){const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,value:await response.json()};}};
}

test('explicit preference category survives edits, refresh, revision history and SQLite restart',async t=>{
  const f=await fixture(t),source=(await f.request('sources',{title:'测试来源',text:'虚构分类验证'})).value;
  const created=await f.request('facts',{kind:'preference',statement:'包含设计、发布与音乐的测试句，不由词语推断类别。',preferenceDomain:'work',status:'confirmed',sourceIds:[source.id]});assert.equal(created.status,201);
  const id=created.value.id,edited=await f.request(`facts/${id}`,{statement:'更新后的虚构测试句',baseVersion:1},'PUT');assert.equal(edited.value.preferenceDomain,'work');
  const reclassified=await f.request(`facts/${id}`,{preferenceDomain:'taste',reason:'明确分类修正',baseVersion:2},'PUT');assert.equal(reclassified.value.version,3);
  await f.restart();const saved=(await f.request(`facts/${id}`)).value;
  assert.equal(saved.preferenceDomain,'taste');assert.deepEqual(saved.history.map(row=>row.preferenceDomain),['work','work','taste']);assert.deepEqual(saved.sourceIds,[source.id]);
  assert.equal((await f.request('bootstrap')).value.facts.find(row=>row.id===id).preferenceDomain,'taste');
  assert.equal((await f.request(`facts/${id}`,{preferenceDomain:'work',baseVersion:2},'PUT')).status,409);
});

test('invalid categories and categories on other fact kinds do not change saved facts',async t=>{
  const f=await fixture(t),fact=(await f.request('facts',{kind:'preference',statement:'原始句',preferenceDomain:'work'})).value;
  for(const preferenceDomain of ['automatic','',null,17])assert.equal((await f.request(`facts/${fact.id}`,{preferenceDomain,baseVersion:1},'PUT')).status,400);
  assert.equal((await f.request('facts',{kind:'identity',statement:'测试身份',preferenceDomain:'taste'})).status,400);
  assert.equal((await f.request(`facts/${fact.id}`)).value.version,1);
  const changed=await f.request(`facts/${fact.id}`,{kind:'capability',baseVersion:1},'PUT');assert.equal(changed.status,200);assert.equal(changed.value.preferenceDomain,undefined);assert.equal(changed.value.history[0].preferenceDomain,'work');assert.equal(changed.value.history.at(-1).preferenceDomain,undefined);
  const legacy=(await f.request('facts',{kind:'preference',statement:'音乐、设计、产品发布等字词不触发自动分类'})).value;
  assert.equal(legacy.preferenceDomain,undefined);const general=await f.request(`facts/${legacy.id}`,{preferenceDomain:'general',baseVersion:1},'PUT');assert.equal(general.value.preferenceDomain,'general');
});
