import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {HttpError} from '../server/store.mjs';

async function fixture(t,{dataDir}={}){
  const directory=dataDir??mkdtempSync(path.join(os.tmpdir(),'secondu-navigation-'));
  const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}/api/`;
  let closed=false;
  const close=async()=>{if(!closed){closed=true;await app.close();}};
  t.after(async()=>{await close();if(!dataDir)rmSync(directory,{recursive:true,force:true});});
  const request=async(route='settings/navigation',body,method=body===undefined?'GET':'PUT')=>{
    const result=await fetch(base+route,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:result.status,value:await result.json()};
  };
  const prefs=body=>request('settings/navigation',body);
  return {app,directory,close,request,prefs};
}

test('preferences start unset and preserve explicit migration without creating a finance default',async t=>{
  const f=await fixture(t);
  assert.deepEqual(await f.prefs(),{status:200,value:null});
  assert.deepEqual((await f.prefs({migrate:{pinned:['finance','agents','finance'],financeExpanded:true}})).value,{pinned:['agents','finance'],financeExpanded:true,agentsExpanded:true});
  assert.deepEqual((await f.prefs({migrate:{pinned:[],financeExpanded:false,agentsExpanded:false}})).value,{pinned:['agents','finance'],financeExpanded:true,agentsExpanded:true});
});

test('older saved preferences gain the Agents default on read without changing stored values',async t=>{
  const f=await fixture(t);
  const older={pinned:['finance'],financeExpanded:true};
  f.app.store.setMeta('navigationPreferences',older);
  const original=f.app.store.setMeta.bind(f.app.store);
  f.app.store.setMeta=()=>{throw new Error('reading preferences must not write');};
  assert.deepEqual((await f.prefs()).value,{...older,agentsExpanded:true});
  assert.deepEqual(f.app.store.get('meta','navigationPreferences').value,older);
  f.app.store.setMeta=original;
  assert.deepEqual((await f.prefs({agentsExpanded:false})).value,{...older,agentsExpanded:false});
});

test('explicit Agents migration supports collapsed state without inventing other preferences',async t=>{
  const f=await fixture(t);
  assert.deepEqual((await f.prefs({migrate:{agentsExpanded:false}})).value,{pinned:[],financeExpanded:false,agentsExpanded:false});
});

test('pin mutations and expansion update independently, including unpinning every feature',async t=>{
  const f=await fixture(t);
  await f.prefs({pin:{id:'finance',pinned:true}});
  await f.prefs({financeExpanded:true});
  await f.prefs({agentsExpanded:false});
  await f.prefs({pin:{id:'agents',pinned:true}});
  assert.deepEqual((await f.prefs()).value,{pinned:['agents','finance'],financeExpanded:true,agentsExpanded:false});
  await f.prefs({financeExpanded:false});
  await f.prefs({pin:{id:'finance',pinned:false}});
  await f.prefs({pin:{id:'agents',pinned:false}});
  assert.deepEqual((await f.prefs()).value,{pinned:[],financeExpanded:false,agentsExpanded:false});
  assert.deepEqual((await f.prefs({migrate:{pinned:['finance'],financeExpanded:true,agentsExpanded:true}})).value,{pinned:[],financeExpanded:false,agentsExpanded:false});
  assert.deepEqual((await f.prefs({agentsExpanded:true})).value,{pinned:[],financeExpanded:false,agentsExpanded:true});
});

test('invalid and unsupported requests leave the confirmed preference unchanged',async t=>{
  const f=await fixture(t);const saved=(await f.prefs({financeExpanded:true})).value;
  for(const body of [{},{pinned:['finance']},{unknown:true},{pin:{id:'settings',pinned:true}},{pin:{id:'finance',pinned:'true'}},{pin:{id:'finance',pinned:true,extra:1}},{financeExpanded:'false'},{agentsExpanded:'false'},{agentsExpanded:null},{agentsExpanded:false,financeExpanded:true},{financeExpanded:false,pin:{id:'finance',pinned:true}},{migrate:{}},{migrate:{pinned:['unknown']}},{migrate:{pinned:null}},{migrate:{financeExpanded:null}},{migrate:{agentsExpanded:null}},{migrate:{extra:true}}]){
    assert.equal((await f.prefs(body)).status,400,JSON.stringify(body));
    assert.deepEqual((await f.prefs()).value,saved);
  }
  assert.equal((await f.request('settings/navigation',{},'POST')).status,405);
});

test('the same space survives server and origin changes while a personal space stays independent',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-navigation-restart-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const first=await fixture(t,{dataDir:directory});
  const saved=(await first.prefs({migrate:{pinned:['finance'],financeExpanded:true,agentsExpanded:false}})).value;
  assert.equal((await first.request('spaces/personal',{},'POST')).status,200);
  assert.equal((await first.request('spaces/personal/settings/navigation')).value,null);
  await first.request('spaces/personal/settings/navigation',{pin:{id:'artifacts',pinned:true}});
  assert.deepEqual((await first.prefs()).value,saved);
  await first.close();
  const second=await fixture(t,{dataDir:directory});
  assert.deepEqual((await second.prefs()).value,saved);
  assert.deepEqual((await second.request('spaces/personal/settings/navigation')).value,{pinned:['artifacts'],financeExpanded:false,agentsExpanded:true});
  await second.close();
});

test('storage failure returns an error and never replaces the prior value',async t=>{
  const f=await fixture(t);const saved=(await f.prefs({migrate:{pinned:['finance'],financeExpanded:true}})).value;
  const original=f.app.store.setMeta.bind(f.app.store);
  f.app.store.setMeta=(key,value)=>{if(key==='navigationPreferences')throw new HttpError(503,'磁盘不可用');return original(key,value);};
  assert.equal((await f.prefs({financeExpanded:false})).status,503);
  f.app.store.setMeta=original;
  assert.deepEqual((await f.prefs()).value,saved);
});
