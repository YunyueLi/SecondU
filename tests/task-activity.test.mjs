import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleTaskEvents, activityEventType } from '../src/design-system/taskActivityEvents.ts';
const event=(type,detail)=>({id:type,type,label:type,createdAt:'2026-09-29T10:00:00Z',detail});

test('a simple greeting with lifecycle records and empty context has no execution panel',()=>{
 const events=['created','started','agent_started','agent_model','runtime.connecting','runtime.thread','runtime.message','runtime.completed','agent_completed','artifact_saved','completed'].map(type=>event(type,'Recorded'));
 events.push(event('context','[]'),event('evidence','{"sources":[],"totalExcerptChars":0}'));
 assert.deepEqual(visibleTaskEvents(events),[]);
});
test('real work, approvals, evidence, public summaries and problems stay inspectable',()=>{
 const events=[event('connector.call','read file'),event('connector.result','read completed'),event('runtime.action','Read file'),event('runtime.action_failed','Failed'),event('approval_requested','Write file'),event('runtime.approval','Confirm'),event('context','[{"statement":"Budget is 500"}]'),event('evidence','{"sources":[{"excerpt":"Original evidence"}]}'),event('runtime.reasoning_summary','Public summary'),event('runtime.progress','Reading sources'),event('failed','Error'),event('configuration_required','Missing key'),event('artifact_collection_warning','Skipped file'),event('artifact_pending','Review file'),event('interrupted','Stopped')];
 assert.deepEqual(visibleTaskEvents(events),events);assert.deepEqual(visibleTaskEvents([event('runtime.reasoning_summary',''),event('context','[{}]'),event('evidence','{"sources":[{"excerpt":""}]}')]),[]);
});
test('public commentary, actual collaboration and review records are visible without final answers or raw reasoning',()=>{
 const commentary={...event('runtime.message','I will inspect the source.'),activity:{kind:'message',phase:'completed',messagePhase:'commentary'}};
 const final={...event('runtime.message','The final answer.'),id:'final',activity:{kind:'message',phase:'completed',messagePhase:'final_answer'}};
 const records=['runtime.collaboration','runtime.subagent_activity','runtime.auto_review','team.worker_started','team.worker_finished','connector.rejected'].map(type=>event(type,'Recorded'));
 assert.deepEqual(visibleTaskEvents([commentary,final,event('runtime.message','No recorded phase'),event('runtime.reasoning','Private'),...records]),[commentary,...records]);
});
test('remote aliases are explicit and bounded; visible events retain their original source records',()=>{
 assert.equal(activityEventType('remote.runtime.plan'),'runtime.plan');
 assert.equal(activityEventType('remote.runtime.message'),'runtime.message');
 assert.equal(activityEventType('remote.runtime.auto_review'),'runtime.auto_review');
 assert.equal(activityEventType('remote.remote.started'),'started');
 assert.equal(activityEventType('remote.remote.completed'),'completed');
 assert.equal(activityEventType('remote.remote.approval'),'approval_requested');
 assert.equal(activityEventType('remote.remote.approval_resolved'),'approval_decided');
 for(const type of ['remote.remote.runtime.plan','remote.remote.remote.started','remote.runtime.future_type','remote.arbitrary.started','runtime.plan'])assert.equal(activityEventType(type),type);
 const commentary={...event('remote.runtime.message','Remote work explanation'),activity:{kind:'message',phase:'completed',messagePhase:'commentary'}};
 const final={...event('remote.runtime.message','Final answer'),id:'remote-final',activity:{kind:'message',phase:'completed',messagePhase:'final_answer'}};
 const plan=event('remote.runtime.plan','{"plan":[{"step":"Read","status":"inProgress"}]}');
 const review=event('remote.runtime.auto_review','{"status":"denied"}');
 const approval=event('remote.remote.approval','Review this action');
 const input=[commentary,final,plan,review,approval];
 const result=visibleTaskEvents(input);
 assert.deepEqual(result,[commentary,plan,review,approval]);
 assert.equal(result[0],commentary);assert.equal(result[0].type,'remote.runtime.message');
});
