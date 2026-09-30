import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {selectPersonalContext} from '../shared/personal-context.mjs';
import {planTurn} from '../server/turn-policy.mjs';

const fact=(id,kind,statement,status='confirmed')=>({id,kind,statement,status,version:1,sourceIds:[]});
test('enabled digital twin retains confirmed baseline for greetings and broad identity questions',()=>{
 const facts=[fact('identity','identity','我从事设计工作'),fact('style','preference','回答简短'),fact('goal','goal','完成夏季展览'),fact('guess','identity','尚未确认的身份','candidate')];
 assert.deepEqual(selectPersonalContext(facts,'你好',{baseline:true}),['identity','style']);
 assert.deepEqual(selectPersonalContext(facts,'我是谁？',{baseline:true}),['identity','style','goal']);
 assert.equal(planTurn({prompt:'你好',messages:[],digitalTwinEnabled:true},[]).useContext,true);
 assert.equal(planTurn({prompt:'整理工作计划',messages:[],digitalTwinEnabled:false},[]).useContext,false);
});

test('each enabled turn rereads current cognition; disabling drops profile, facts and the previous model thread',async t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'hither-twin-mode-')),calls=[];
 const app=createApp({dataDir:directory,scheduler:false,runCodex:async input=>{calls.push({prompt:input.prompt,threadId:input.threadId});return{text:'Fixture reply',threadId:`fixture-thread-${calls.length}`};},computerInfo:{codexAvailable:true}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const api=async(route,body,method='POST')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,`${route}: ${r.status}`);return r.json();};
 const settled=async id=>{for(let n=0;n<200;n++){if(!app.runner.active.has(id))return app.store.require('tasks',id);await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Task did not settle');};
 await api('settings/provider',{apiKey:'fixture-not-a-real-key'},'PUT');
 const baseline=fact('fixture-identity','identity','已确认身份甲');app.store.put('facts',baseline);
 const task=await api('tasks',{prompt:'你好',mode:'live',digitalTwinEnabled:true});
 await api(`tasks/${task.id}/run`,{});await settled(task.id);
 assert.match(calls[0].prompt,/用户档案/);assert.match(calls[0].prompt,/已确认身份甲/);assert.match(calls[0].prompt,/万叶/);
 app.store.put('facts',{...baseline,version:2,statement:'已确认身份乙'});
 await api(`tasks/${task.id}/message`,{content:'我是谁？'});await settled(task.id);
 assert.match(calls[1].prompt,/已确认身份乙/);assert.doesNotMatch(calls[1].prompt,/已确认身份甲/);assert.equal(calls[1].threadId,'fixture-thread-1');
 await api(`tasks/${task.id}`,{digitalTwinEnabled:false},'PUT');
 await api(`tasks/${task.id}/message`,{content:'你好'});await settled(task.id);
 assert.equal(calls[2].threadId,undefined);assert.doesNotMatch(calls[2].prompt,/用户档案（|已确认身份[甲乙]/);assert.match(calls[2].prompt,/选中认知（本轮版本）：\[\]/);
 assert.deepEqual(JSON.parse(app.store.require('tasks',task.id).events.filter(e=>e.type==='context').at(-1).detail),[]);
});
