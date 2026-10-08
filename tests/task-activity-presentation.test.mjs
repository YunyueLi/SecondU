import test from 'node:test';
import assert from 'node:assert/strict';
import {activityStatusLabel, activityActionStatusLabel, activityElapsedLabel, activityEventLabel} from '../src/design-system/taskActivityPresentation.ts';
import {taskConversationTurns} from '../src/taskConversation.ts';
import {buildTaskActivityModel} from '../src/design-system/taskActivityModel.ts';

const action = (kind = 'web_search', status = 'running') => ({id:'call-1', kind, status, name:'internal_tool_identifier', eventIds:['event-1']});
const model = overrides => ({status:'running', stopping:false, activeActions:[], actions:[], actionGroups:[], collaborators:[], elapsed:{milliseconds:null, running:false, includesApprovalWait:true}, hasWork:false, ...overrides});

test('waiting and terminal states win over stale active tools, plan steps and public progress', () => {
  const stale = {activeActions:[action()], plan:{steps:[{text:'Reading the old file', status:'running'}], eventIds:[]}, progress:{text:'Preparing the old result', eventIds:[]}, stopping:true};
  const expected = {queued:'Waiting to start', awaiting_approval:'Waiting for approval', needs_input:'More information needed', failed:'This run failed', cancelled:'Stopped', interrupted:'Run interrupted', completed:'Turn completed'};
  for (const [status, label] of Object.entries(expected)) assert.equal(activityStatusLabel(model({...stale, status})).en, label, status);
});

test('only recorded running actions describe current tool use and cancellation overrides them', () => {
  assert.equal(activityStatusLabel(model({activeActions:[action()]})).en, 'Searching the web');
  assert.equal(activityStatusLabel(model({activeActions:[action(), action('file_change')]})).en, 'Running 2 operations');
  assert.equal(activityStatusLabel(model({stopping:true, activeActions:[action()]})).en, 'Stopping');
  assert.equal(activityStatusLabel(model({review:{status:'running',eventIds:[]}, activeActions:[action()]})).en, 'Reviewing an operation');
  assert.equal(activityStatusLabel(model({status:'failed',review:{status:'running',eventIds:[]}})).en, 'This run failed');
  for (const status of ['completed','failed','rejected','unknown']) {
    assert.equal(activityStatusLabel(model({activeActions:[action('tool',status)]})).en, 'Working', status);
  }
  assert.equal(activityStatusLabel(model({activeActions:[action('connector')]})).en, 'Using a connected app', 'an app operation must not be described as a read');
  assert.equal(activityStatusLabel(model({activeActions:[action('command')]})).en, 'Running a command', 'a command receipt does not establish which computer is executing it');
});

test('an unapproved review replaces an old running plan while a later active action takes precedence', () => {
  const plan = {steps:[{text:'检查页面交互',status:'running'}],eventIds:['old-plan']};
  const labels = {
    rejected:{zh:'上次操作未获批准',en:'The last operation was not approved'},
    failed:{zh:'上次操作审查未完成',en:'The last operation review did not finish'},
    cancelled:{zh:'上次操作审查已停止',en:'The last operation review was stopped'},
  };
  for (const [status,label] of Object.entries(labels)) {
    const review = {status,eventIds:['review']};
    assert.deepEqual(activityStatusLabel(model({review,plan})),label);
    assert.equal(activityStatusLabel(model({review,plan,activeActions:[action('web_search')]})).en,'Searching the web');
    assert.equal(activityStatusLabel(model({status:'completed',review,plan})).en,'Turn completed');
    assert.equal(activityStatusLabel(model({status:'failed',review,plan})).en,'This run failed');
    assert.equal(activityStatusLabel(model({stopping:true,review,plan})).en,'Stopping');
  }
});

test('unconfirmed remote work reports dispatch or observation instead of claiming current execution', () => {
  const remote = {computerName:'Remote computer',observation:'disconnected',dispatch:'submitted',unconfirmed:true};
  const stale = {remote,stopping:true,activeActions:[action()],review:{status:'running',eventIds:[]},plan:{steps:[{text:'Old recorded work',status:'running'}],eventIds:[]}};
  for (const status of ['queued','running','awaiting_approval','needs_input']) assert.equal(activityStatusLabel(model({...stale,status})).en, 'Unable to reach the execution computer', status);
  assert.equal(activityStatusLabel(model({...stale,remote:{...remote,dispatch:'uncertain'}})).en, 'Dispatch not confirmed');
  assert.equal(activityStatusLabel(model({...stale,remote:{...remote,dispatch:'pending'}})).en, 'Dispatch not confirmed');
  assert.equal(activityStatusLabel(model({...stale,remote:{...remote,observation:'pending'}})).en, 'Awaiting confirmation from the execution computer');
  for (const [status,label] of Object.entries({completed:'Turn completed',failed:'This run failed',cancelled:'Stopped',interrupted:'Run interrupted'})) assert.equal(activityStatusLabel(model({...stale,status})).en,label);
  assert.equal(activityStatusLabel(model({remote:{...remote,observation:'connected',unconfirmed:false},activeActions:[action('command')]})).en,'Running a command');
});

test('progress for a new correction uses its queued turn while the prior run is still stopping', () => {
  const time = second => `2026-10-08T03:00:0${second}.000Z`;
  const task = {id:'task',status:'running',createdAt:time(0),messages:[{id:'first',role:'user',createdAt:time(0)},{id:'second',role:'user',createdAt:time(3)}],events:[{id:'start',type:'started',label:'Started',createdAt:time(1)},{id:'correction',type:'correction',label:'Correction',createdAt:time(3)}]};
  const turn = taskConversationTurns(task).at(-1);
  const current = buildTaskActivityModel({...task,events:turn.events,messages:turn.messages,status:turn.status});
  assert.equal(task.status,'running');
  assert.equal(current.status,'queued');
  assert.equal(activityStatusLabel(current).en,'Waiting to start');
  assert.deepEqual(current.activeActions,[]);
  assert.equal(activityElapsedLabel(current.elapsed),null);
});

test('public commentary and completed steps do not become a repeated or misleading current title', () => {
  assert.equal(activityStatusLabel(model({progress:{text:'Finished reading; the full explanation belongs in the activity panel.', eventIds:[]}})).en, 'Working');
  assert.equal(activityStatusLabel(model({plan:{steps:[{text:'Reviewed all files', status:'completed'}], eventIds:[]}})).en, 'Working');
  assert.equal(activityStatusLabel(model({plan:{steps:[{text:'Reviewing the selected files', status:'running'}], eventIds:[]}})).en, 'Reviewing the selected files');
  for (const text of ['A'.repeat(65), 'Reading\nseveral files']) assert.equal(activityStatusLabel(model({plan:{steps:[{text, status:'running'}], eventIds:[]}})).en, 'Working');
  assert.equal(activityStatusLabel(model({collaborators:[{status:'running'}]})).en, 'Working with other agents');
  assert.equal(activityStatusLabel(model({collaborators:[{status:'completed'}]})).en, 'Working');
});

test('a failed historical operation retains its own outcome inside a completed task', () => {
  assert.equal(activityStatusLabel(model({status:'completed'})).en, 'Turn completed');
  assert.equal(activityActionStatusLabel('failed').en, 'Operation failed');
  assert.equal(activityActionStatusLabel('rejected').en, 'Not approved');
  assert.equal(activityActionStatusLabel('unknown').en, 'Operation record');
  assert.equal(activityActionStatusLabel('running').en, 'Started', 'an inspectable start receipt is not proof that execution is still active');
});

test('tool labels localize structured phases without trusting a name or legacy outcome wording', () => {
  const event = {id:'call-event',type:'runtime.action',label:'本机命令已结束',createdAt:'2026-10-08T01:00:00Z'};
  assert.deepEqual(activityEventLabel({...event,activity:{kind:'command',phase:'running',name:'已成功'}}), {zh:'已开始执行命令',en:'Command started'});
  assert.deepEqual(activityEventLabel({...event,activity:{kind:'web_search',phase:'completed'}}), {zh:'网页检索已完成',en:'Web search completed'});
  assert.equal(activityEventLabel({...event,activity:{kind:'file_change',phase:'failed'}}).en,'File changes failed');
  assert.equal(activityEventLabel({...event,activity:{kind:'tool',phase:'rejected'}}).en,'Tool call declined');
  assert.equal(activityEventLabel({...event,activity:{kind:'connector',phase:'completed'}}).en,'App operation completed');
  assert.deepEqual(activityEventLabel(event),{zh:event.label,en:event.label},'legacy wording cannot establish a structured operation state');
  assert.deepEqual(activityEventLabel({...event,activity:{kind:'unknown',phase:'completed'}}),{zh:event.label,en:event.label});
  for (const [kind,label] of Object.entries({command:'Command started',file_change:'File changes started',web_search:'Web search started',tool:'Tool call started',connector:'App operation started'})) assert.equal(activityEventLabel({...event,activity:{kind,phase:'running'}}).en,label,'a historical start cannot claim that work remains active');
});

test('known lifecycle events localize while authored progress and unknown history stay verbatim', () => {
  const event = {id:'event',type:'failed',label:'源记录',createdAt:'2026-10-08T01:00:00Z'};
  assert.equal(activityEventLabel(event).en,'This run failed');
  assert.equal(activityEventLabel({...event,type:'cancel_requested'}).en,'Stop requested');
  for (const type of ['runtime.plan','runtime.progress','progress','runtime.reasoning_summary','approval_decided','unrecognized']) assert.deepEqual(activityEventLabel({...event,type}),{zh:event.label,en:event.label});
  assert.equal(activityEventLabel({...event,type:'runtime.message',activity:{kind:'message',phase:'completed',messagePhase:'commentary'}}).en,'Work update');
});

test('remote event labels use only known aliases and preserve source objects and authored text', () => {
  const event = {id:'remote-event',type:'remote.remote.failed',label:'远端任务失败',createdAt:'2026-10-08T01:00:00Z'};
  const before = structuredClone(event);
  assert.equal(activityEventLabel(event).en,'This run failed');
  assert.deepEqual(event,before);
  assert.equal(activityEventLabel({...event,type:'remote.runtime.approval'}).en,'Waiting for approval');
  assert.equal(activityEventLabel({...event,type:'remote.runtime.message',activity:{kind:'message',phase:'completed',messagePhase:'commentary'}}).en,'Work update');
  for (const type of ['remote.runtime.plan','remote.runtime.progress','remote.unknown','remote.failed']) assert.deepEqual(activityEventLabel({...event,type}),{zh:event.label,en:event.label});
});

test('automatic review history uses its recorded outcome in both languages and never infers unknown outcomes', () => {
  const base = {id:'review',type:'runtime.auto_review',label:'原始审查记录',createdAt:'2026-10-08T01:00:00Z'};
  const expected = {
    inProgress:{zh:'操作审查已开始',en:'Operation review started'},
    approved:{zh:'操作已获批准',en:'Operation approved'},
    denied:{zh:'操作未获批准',en:'Operation not approved'},
    timedOut:{zh:'操作审查已超时',en:'Operation review timed out'},
    aborted:{zh:'操作审查已停止',en:'Operation review stopped'},
  };
  for (const type of ['runtime.auto_review','remote.runtime.auto_review']) {
    for (const [status,label] of Object.entries(expected)) assert.deepEqual(activityEventLabel({...base,type,detail:JSON.stringify({status})}),label);
    for (const detail of ['{invalid','null','{}','{"status":"unknown"}','{"status":"constructor"}']) assert.deepEqual(activityEventLabel({...base,type,detail}),{zh:base.label,en:base.label});
  }
});

test('elapsed labels require a measured duration and preserve minute/hour boundaries', () => {
  const elapsed = milliseconds => ({milliseconds, running:false, includesApprovalWait:true});
  for (const value of [null, NaN, Infinity, -1]) assert.equal(activityElapsedLabel(elapsed(value)), null);
  assert.deepEqual(activityElapsedLabel(elapsed(999)), {zh:'小于 1 秒', en:'<1s'});
  assert.deepEqual(activityElapsedLabel(elapsed(59999)), {zh:'59 秒', en:'59s'});
  assert.deepEqual(activityElapsedLabel(elapsed(60000)), {zh:'1 分', en:'1m'});
  assert.deepEqual(activityElapsedLabel(elapsed(3661000)), {zh:'1 小时 1 分 1 秒', en:'1h 1m 1s'});
});
