import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp,probeLocalComputer} from '../server/index.mjs';
import {codexCommand} from '../server/codex.mjs';

async function fixture(t,options={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-computer-probe-'));
  const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}/api/`;
  const api=async(route,body,method=body===undefined?'GET':'POST',headers={})=>{
    const response=await fetch(base+route,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,value:await response.json()};
  };
  return {app,api};
}
const runtime=computer=>({codexAvailable:computer.codexAvailable,codexVersion:computer.codexVersion,checkedAt:computer.checkedAt});
const entities=store=>store.db.prepare('SELECT collection,id,data FROM entities ORDER BY collection,id').all();
async function until(check){for(let attempt=0;attempt<100;attempt++){if(check())return;await delay(5);}assert.fail('Expected pending probe requests did not arrive');}

test('the local probe runs only the fixed version command, bounds time/output, and rejects invalid output',async()=>{
  const calls=[];
  const success=await probeLocalComputer(async(...args)=>{calls.push(args);return {stdout:'codex-cli 0.0.0-fixture\n'};});
  assert.deepEqual(success,{codexAvailable:true,codexVersion:'codex-cli 0.0.0-fixture'});
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],codexCommand());
  assert.deepEqual(calls[0][1],['--version']);
  assert.equal(calls[0][2].timeout,5000);
  assert.equal(calls[0][2].maxBuffer,16*1024);
  assert.equal(calls[0][2].killSignal,'SIGKILL');
  assert.equal(calls[0][2].shell,undefined);
  for(const stdout of ['', 'another-cli 1.0', 'codex-cli ', 'codex-cli 1.0\nUnexpected private diagnostics']){
    assert.deepEqual(await probeLocalComputer(async()=>({stdout})),{codexAvailable:false});
  }
  for(const error of [{code:'ENOENT'},{killed:true,signal:'SIGKILL'},{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'}]){
    assert.deepEqual(await probeLocalComputer(async()=>{throw error;}),{codexAvailable:false});
  }
});

test('a fresh probe recovers an unavailable runtime and clears a removed or failed version everywhere',async t=>{
  let step=0;
  const f=await fixture(t,{probeComputer:async()=>{
    step++;
    if(step===1)return {codexAvailable:true,codexVersion:'codex-cli 0.0.1-fixture'};
    if(step===2)return {codexAvailable:false,codexVersion:'must-not-retain-old-version'};
    if(step===3)return {codexAvailable:true,codexVersion:'codex-cli 0.0.2-fixture'};
    throw new Error('Private process details must not appear in the response');
  }});
  const original=f.app.bootstrap().computer,records=entities(f.app.store);
  assert.equal(original.codexAvailable,false);
  for(const available of [true,false,true,false]){
    const before=Date.now(),response=await f.api('computer/probe',{});
    assert.equal(response.status,200);
    assert.equal(response.value.codexAvailable,available);
    assert.ok(Date.parse(response.value.checkedAt)>=before);
    if(!available)assert.equal(Object.hasOwn(response.value,'codexVersion'),false);
    assert.deepEqual((await f.api('bootstrap')).value.computer,response.value);
    const adapter=(await f.api('runtime/capabilities')).value.adapters.find(row=>row.id==='codex-app-server');
    assert.equal(adapter.available,available);
    assert.equal(adapter.version,response.value.codexVersion);
    assert.doesNotMatch(JSON.stringify(response.value),/Private process|must-not-retain/);
  }
  assert.equal(step,4);
  assert.equal(original.codexAvailable,false,'previous snapshots must not mutate');
  assert.deepEqual(entities(f.app.store),records,'probing must not write persistent records');
});

test('concurrent probes share one check across personal and showcase spaces, with distinct workspaces',async t=>{
  let calls=0,release;
  const f=await fixture(t,{probeComputer:()=>{calls++;return calls===1?new Promise(resolve=>{release=resolve;}):{codexAvailable:false};}});
  for(const space of ['personal','demo-cn-v1'])assert.equal((await f.api(`spaces/${space}`,{})).status,200);
  const prefixes=['','spaces/personal/','spaces/demo-cn-v1/'];
  const pending=prefixes.map(prefix=>f.api(prefix+'computer/probe',{}));
  try{
    await until(()=>f.app.updateLifecycle.requests.size===3&&calls===1);
    assert.equal(calls,1);
    release({codexAvailable:true,codexVersion:'codex-cli 0.0.3-fixture'});
    const results=await Promise.all(pending);
    assert.ok(results.every(result=>result.status===200));
    assert.deepEqual(results.map(result=>runtime(result.value)),Array(3).fill(runtime(results[0].value)));
    assert.equal(new Set(results.map(result=>result.value.workspace)).size,3);
    for(const prefix of prefixes)assert.deepEqual(runtime((await f.api(prefix+'bootstrap')).value.computer),runtime(results[0].value));
    assert.equal(calls,1,'bootstrap refreshes must not start another check');
    const failure=await f.api('spaces/personal/computer/probe',{});
    assert.equal(failure.value.codexAvailable,false);
    assert.equal(calls,2);
    for(const prefix of prefixes)assert.deepEqual(runtime((await f.api(prefix+'bootstrap')).value.computer),runtime(failure.value));
    assert.equal((await f.api('spaces/demo-us-v1',{})).status,200);
    assert.deepEqual(runtime((await f.api('spaces/demo-us-v1/bootstrap')).value.computer),runtime(failure.value),'new spaces reuse the latest result');
  }finally{
    release?.({codexAvailable:false});
    await Promise.allSettled(pending);
  }
});

test('existing computer fixtures remain authoritative and explicit probes can start without a startup host check',async t=>{
  const fixed=await fixture(t,{computerInfo:{codexAvailable:true,codexVersion:'codex-cli fixture-only-123'}});
  const result=await fixed.api('computer/probe',{});
  assert.equal(result.value.codexVersion,'codex-cli fixture-only-123');
  assert.equal(result.value.codexAvailable,true);
  let calls=0;
  const injected=await fixture(t,{computerInfo:undefined,probeComputer:async()=>{calls++;return {codexAvailable:true,codexVersion:'codex-cli injected-only-123'};}});
  assert.equal(calls,0);
  assert.equal(injected.app.bootstrap().computer.codexAvailable,false);
  assert.equal((await injected.api('computer/probe',{})).value.codexVersion,'codex-cli injected-only-123');
  assert.equal(calls,1);
});

test('the probe obeys local origin, JSON and method guards and never accepts a supplied command',async t=>{
  let calls=0,models=0;
  const f=await fixture(t,{executionPolicy:'showcase',probeComputer:async()=>{calls++;return {codexAvailable:false};},runCodex:async()=>{models++;throw new Error('Must not execute a model');}});
  assert.equal((await f.api('computer/probe')).status,405);
  assert.equal((await f.api('computer/probe',{},'PUT')).status,405);
  assert.equal((await f.api('computer/probe',{},'POST',{Origin:'https://outside.test'})).status,403);
  assert.equal((await f.api('computer/probe',{},'POST',{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await f.api('computer/probe',{},'POST',{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.api('computer/probe',{command:'untrusted',args:['execute']})).status,400);
  assert.equal((await f.api('computer/probe/extra',{})).status,404);
  assert.equal(calls,0);
  assert.equal((await f.api('computer/probe',{})).status,200,'showcase can inspect the local fixed version');
  assert.equal(calls,1);
  assert.equal(models,0);
});
