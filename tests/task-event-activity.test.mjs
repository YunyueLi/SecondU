import test from 'node:test';
import assert from 'node:assert/strict';
import {taskEventActivity} from '../server/task-event-activity.mjs';
import {addEvent} from '../server/domain.mjs';

test('display activity only preserves bounded allowlisted fields and never carries permission or arguments',()=>{
 const secret='synthetic-activity-secret';
 const value={kind:'tool',phase:'running',callId:`call-${secret}`,name:`read ${secret}`,arguments:{password:secret},approval:'approve',permissions:{all:true},messagePhase:'final_answer'};
 assert.deepEqual(taskEventActivity(value,text=>text.replaceAll(secret,'[redacted]')),{kind:'tool',phase:'running',callId:'call-[redacted]',name:'read [redacted]'});
 for(const invalid of [null,[],{},'running',{kind:'unknown',phase:'running'},{kind:'tool',phase:'approved'},{kind:'message',phase:'running'}])assert.equal(taskEventActivity(invalid),undefined);
 for(const callId of ['','bad id','line\nbreak','x'.repeat(513),{}])assert.deepEqual(taskEventActivity({kind:'command',phase:'completed',callId}),{kind:'command',phase:'completed'});
 assert.equal(taskEventActivity({kind:'tool',phase:'running',name:'x'.repeat(200)}).name.length,160);
 assert.equal(taskEventActivity({kind:'tool',phase:'running',name:'x'.repeat(4097)}).name,undefined);
 assert.deepEqual(taskEventActivity({kind:'message',phase:'completed',messagePhase:'analysis',raw_content:'private'}),{kind:'message',phase:'completed'});
});

test('event persistence is backwards compatible and snapshots only sanitized activity',()=>{
 const task={events:[]};addEvent(task,'legacy','Recorded','Original detail','agent');
 assert.equal(Object.hasOwn(task.events[0],'activity'),false);assert.equal(task.events[0].detail,'Original detail');
 const activity={kind:'command',phase:'running',callId:'call-1',extra:{permissions:'all'}};
 addEvent(task,'runtime.action','Recorded','command\noutput','agent',activity);
 activity.phase='completed';
 assert.deepEqual(task.events[1].activity,{kind:'command',phase:'running',callId:'call-1'});assert.equal(task.events[1].detail,'command\noutput');
});
