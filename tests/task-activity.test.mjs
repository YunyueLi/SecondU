import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleTaskEvents } from '../src/design-system/taskActivityEvents.ts';
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
