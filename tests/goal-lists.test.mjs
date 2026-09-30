import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { createEntity, assertDeletable } from '../server/domain.mjs';

function fixture(t,seed=false) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-reminders-'));
  let store=new Store(directory,{seed});
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return {get store(){return store},restart(){store.close();store=new Store(directory,{seed});return store}};
}
function save(store,collection,body,key){const value=createEntity(store,collection,body,key?store.require(collection,key):undefined);return store.put(collection,value);}

test('reminders retain list, flag, exact date, completion and source through restart; clearing a date and reopening remove stale fields',t=>{
  const f=fixture(t), list=save(f.store,'goalLists',{name:'虚构验证清单',color:'purple'});
  const source=save(f.store,'sources',{title:'虚构测试来源',text:'  原始内容\n',kind:'note'});
  const item=save(f.store,'goals',{title:'虚构待办',description:'保留备注',listId:list.id,dueDate:'2026-10-03',flagged:true,sourceIds:[source.id]});
  const done=save(f.store,'goals',{status:'done'},item.id);assert.ok(done.completedAt);
  const repeated=save(f.store,'goals',{status:'done'},item.id);assert.equal(repeated.completedAt,done.completedAt);
  f.restart();const persisted=f.store.require('goals',item.id);assert.equal(persisted.listId,list.id);assert.equal(persisted.flagged,true);assert.equal(persisted.dueDate,'2026-10-03');assert.equal(persisted.completedAt,done.completedAt);assert.deepEqual(persisted.sourceIds,[source.id]);
  const reopened=save(f.store,'goals',{status:'active',dueDate:''},item.id);assert.equal(reopened.dueDate,undefined);assert.equal(reopened.completedAt,undefined);assert.equal(reopened.description,'保留备注');assert.equal(f.store.require('sources',source.id).text,'  原始内容\n');
  const renamed=save(f.store,'goalLists',{name:'改名后的测试清单',color:'orange'},list.id);f.restart();assert.equal(f.store.require('goalLists',list.id).name,renamed.name);assert.equal(f.store.require('goals',item.id).listId,list.id);
});

test('invalid dates, flags and missing lists are rejected without overwriting a reminder',t=>{
  const f=fixture(t),item=save(f.store,'goals',{title:'原待办',description:'',sourceIds:[]});
  for(const patch of [{dueDate:'2026-02-30'},{dueDate:'2026-10'},{dueDate:'tomorrow'},{flagged:'true'},{listId:'missing-list'}])assert.throws(()=>save(f.store,'goals',patch,item.id));
  assert.equal(f.store.require('goals',item.id).title,'原待办');assert.equal(f.store.require('goals',item.id).listId,'goal-list-inbox');assert.equal(f.store.require('goals',item.id).status,'active');
});

test('default and referenced lists are protected; an empty custom list can be removed',t=>{
  const f=fixture(t),list=save(f.store,'goalLists',{name:'临时清单'});assert.throws(()=>assertDeletable(f.store,'goalLists','goal-list-inbox'),/默认/);
  const item=save(f.store,'goals',{title:'测试',listId:list.id});assert.throws(()=>assertDeletable(f.store,'goalLists',list.id),/引用/);
  save(f.store,'goals',{listId:'goal-list-inbox'},item.id);assert.doesNotThrow(()=>assertDeletable(f.store,'goalLists',list.id));f.store.delete('goalLists',list.id);assert.equal(f.store.get('goalLists',list.id),undefined);
});

test('fictional list migration is idempotent and never resets a user list assignment on restart',t=>{
  const f=fixture(t,true);assert.equal(f.store.require('goals','goal-exhibition').listId,'goal-list-work');assert.equal(f.store.require('goals','demo-v2-goal-rest').listId,'goal-list-personal');
  save(f.store,'goals',{listId:'goal-list-inbox'},'goal-exhibition');const count=f.store.list('goalLists').length;f.restart();assert.equal(f.store.list('goalLists').length,count);assert.equal(f.store.require('goals','goal-exhibition').listId,'goal-list-inbox');
});

test('goal-list HTTP routes create, rename and expose the same lists in bootstrap',async t=>{
  const {createApp}=await import('../server/index.mjs');
  const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-reminders-api-'));
  const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${app.server.address().port}/api`;
  async function request(route,body,method=body?'POST':'GET'){const response=await fetch(url+route,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,value:await response.json()};}
  const created=await request('/goal-lists',{name:'API 虚构清单',color:'green'});assert.equal(created.status,201);
  const renamed=await request(`/goal-lists/${created.value.id}`,{name:'已改名清单'},'PUT');assert.equal(renamed.status,200);
  const bootstrap=await request('/bootstrap');assert.equal(bootstrap.value.goalLists.find(list=>list.id===created.value.id).name,'已改名清单');
  const item=await request('/goals',{title:'API 虚构待办',listId:created.value.id,flagged:true});assert.equal(item.status,201);
  assert.equal((await request(`/goal-lists/${created.value.id}`,{},'DELETE')).status,409);
  const done=await request(`/goals/${item.value.id}`,{status:'done'},'PUT');assert.equal(done.value.flagged,true);assert.ok(done.value.completedAt);
});
