import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {demoConversationKind,demoDocument} from '../server/demo.mjs';
const agent={id:'fixture',name:'筹划伙伴',role:'拆解任务',instructions:'INTERNAL-INSTRUCTIONS'};
const task=(prompt,latest=prompt)=>({prompt,title:prompt,messages:[{role:'user',content:prompt},...(latest===prompt?[]:[{role:'user',content:latest}])]});
const fact=(statement,status='confirmed')=>({id:'fixture-fact',kind:'constraint',statement,status,version:19,sourceIds:[]});

test('short greetings and thanks are natural local replies without headings or internal context',()=>{
  for(const input of ['hi','Hello!','你好。','在吗？','谢谢你']){
    const output=demoDocument({task:task(input),facts:[fact('UNRELATED-PERSONAL-FACT')],agent});
    assert.ok(output.length<120);assert.match(output,/本地演示/);assert.doesNotMatch(output,/#|UNRELATED|INTERNAL|confirmed|v19|当前分工|本轮使用|用户任务/);
  }
  assert.equal(demoConversationKind(task('hi，请帮我写邀请')) ,undefined);
  assert.equal(demoConversationKind(task('准备声音展','谢谢')),'thanks');
});

test('meaningful demo drafts remain concise and use only topical facts, without engineering labels',()=>{
  const draft=demoDocument({task:task('准备社区声音展'),facts:[fact('社区声音展预算不超过 500 元。'),fact('展览筹备只能用 20 分钟。'),fact('下个月旅行预算 9000 元。')],agent});
  assert.match(draft,/500/);assert.match(draft,/20 分钟/);assert.match(draft,/邀请草稿/);assert.match(draft,/没有调用语言模型/);assert.doesNotMatch(draft,/9000|confirmed|v19|INTERNAL|本轮使用|用户任务/);
  const generic=demoDocument({task:task('整理读书笔记'),facts:[fact('社区声音展预算不超过 500 元。')],agent});
  assert.doesNotMatch(generic,/声音展|500|认知/);assert.ok(generic.length<400);
  const tentative=demoDocument({task:task('准备社区声音展'),facts:[fact('首期预算可能是 600 元。','candidate')],agent});assert.match(tentative,/待你确认/);assert.doesNotMatch(tentative,/candidate/);
});
test('demo identity answers affirm the personal Agent role without inventing memory or turning it into a task',()=>{
  for(const input of ['你是谁？','你不是我的数字分身吗','你是我的超级助理？','Are you my digital twin?']){
    const output=demoDocument({task:task('整理旧项目文档',input),facts:[fact('UNRELATED-PERSONAL-FACT')],agent});
    assert.ok(demoConversationKind(task(input)));assert.match(output,/Hither.*个人 Agent.*数字分身/);assert.match(output,/本地演示.*未调用模型/);assert.doesNotMatch(output,/UNRELATED|旧项目|文稿|完整记忆|我是用户本人/);assert.ok(output.length<180);
  }
  assert.equal(demoConversationKind(task('帮我设计数字分身的访谈提纲')),undefined);
});

test('a demo room greeting completes without approval, files or leaking selected facts; next task can still write a draft',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-demo-replies-'));
  const app=createApp({dataDir:directory,scheduler:false,computerInfo:{codexAvailable:false}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const api=async(route,body)=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(response.ok);return response.json();};
  const wait=async(id,status)=>{for(let i=0;i<100;i++){const result=app.store.get('tasks',id);if(result.status===status)return result;await new Promise(r=>setTimeout(r,5));}throw Error('timed out');};
  const room=await api('agent-rooms',{kind:'direct',agentIds:['agent-planner'],mode:'demo'});
  const greeting=await api(`agent-rooms/${room.id}/messages`,{content:'hi',contextFactIds:['fact-budget']});const done=await wait(greeting.task.id,'completed');
  assert.deepEqual(done.approvals,[]);assert.deepEqual(done.artifactIds,[]);assert.doesNotMatch(done.messages.at(-1).content,/2000|预算|# hi/);assert.equal(app.store.get('agentRooms',room.id).activeTaskId,undefined);
  assert.deepEqual(JSON.parse(done.events.find(e=>e.type==='context').detail),[]);
  const identity=await api(`tasks/${done.id}/message`,{content:'你不是我的数字分身吗'});const identified=await wait(identity.id,'completed');
  assert.deepEqual(identified.artifactIds,[]);assert.deepEqual(identified.approvals,[]);assert.match(identified.messages.at(-1).content,/Hither.*数字分身/);
  const request=await api(`agent-rooms/${room.id}/messages`,{content:'整理 Agent 工作台的内测上线计划，并保存文档',contextFactIds:['fact-budget']});const pending=await wait(request.task.id,'awaiting_approval');
  assert.equal(pending.approvals.length,1);assert.deepEqual(pending.artifactIds,[]);
  await api(`tasks/${pending.id}/approval`,{approvalId:pending.approvals[0].id,decision:'approve'});const finished=await wait(pending.id,'completed');assert.equal(finished.artifactIds.length,1);assert.match(app.store.get('artifacts',finished.artifactIds[0]).content,/2000/);
});


test('workbench demo uses selected relevant constraints and keeps review separate from a plan',()=>{
  const facts=[fact('林遥是远山智能产品工程师，负责 Agent 工作台的需求研究。'),fact('Agent 工作台的模型调用预算不超过 500 元。'),fact('工作日上午保留两小时连续开发，下午半小时整理用户反馈。'),fact('访谈录音、用户资料和对外邀请先确认用途与许可。'),fact('下月旅行预算 9000 元。')];
  const input=task('整理 Agent 工作台的内测上线计划');
  const draft=demoDocument({task:input,facts,agent});
  for(const expected of [/今天要做/,/500/,/连续开发/,/许可/,/中断后继续/])assert.match(draft,expected);assert.doesNotMatch(draft,/9000|声音展|10月12|5次访谈|confirmed/);
  const reviewed=demoDocument({task:input,facts,agent:{...agent,name:'复核伙伴',role:'复核'},previous:[{text:draft}]});
  assert.match(reviewed,/复核|500|重复执行|触发步骤/);assert.notEqual(reviewed,draft);
  const revised=demoDocument({task:input,facts:[fact('Agent 工作台的模型调用预算不超过 300 元。')],agent});
  assert.match(revised,/300/);assert.doesNotMatch(revised,/500|9000/);
});
