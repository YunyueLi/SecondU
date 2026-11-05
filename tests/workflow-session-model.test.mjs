import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowNodeEvents,workflowSessionRows} from '../src/agents/workflowSessionModel.ts';
const node={id:'n1',kind:'worker',agentId:'writer',createdAt:'2026-10-29T00:00:00Z',startedAt:'2026-10-29T00:00:01Z',finishedAt:'2026-10-29T00:00:10Z',status:'completed',name:'Writer',result:'Delivered'};
const run={id:'r1',nodes:[node]};
const event=(id,phase,detail,extra={})=>({id,type:'runtime.action',label:phase,detail,createdAt:'2026-10-29T00:00:03Z',agentId:'writer',teamNodeId:'n1',activity:{kind:'command',phase,callId:'call1'},...extra});
test('a child conversation never joins a concurrent assignment by persona alone',()=>{
 const other={...node,id:'n2'},task={teamRuns:[{...run,nodes:[node,other]}],events:[event('1','running','mine'),event('2','running','other',{teamNodeId:'n2'}),event('3','running','ambiguous',{teamNodeId:undefined})]};
 assert.deepEqual(workflowNodeEvents(task,task.teamRuns[0],node).map(e=>e.detail),['mine']);
 assert.equal(workflowNodeEvents({...task,teamRuns:[run]},run,node).length,2);
});
test('tool lifecycle updates stay in one row and assistant messages keep their order',()=>{
 const task={teamRuns:[run],events:[event('1','running','command'),event('2','completed','First update',{type:'runtime.message',activity:{kind:'message',phase:'completed',callId:'m1',messagePhase:'commentary'}}),event('3','completed','command\noutput'),event('4','completed','Full final answer',{type:'runtime.message',activity:{kind:'message',phase:'completed',callId:'m2',messagePhase:'final_answer'}})]};
 const rows=workflowSessionRows(task,run,node);assert.equal(rows.length,3);assert.equal(rows[0].event.detail,'command\noutput');assert.equal(rows[0].events.length,2);assert.equal(rows[1].kind,'message');assert.equal(rows[2].event.detail,'Full final answer');
});
test('unfinished calls remain interrupted and historical saved replies are used once',()=>{
 const stopped={...node,status:'interrupted',result:undefined};const task={teamRuns:[run],events:[event('1','running','unfinished')]};
 const rows=workflowSessionRows(task,run,stopped);assert.equal(rows[0].interrupted,true);assert.equal(rows.length,1);
 assert.equal(workflowSessionRows({...task,events:[]},run,node)[0].event.detail,'Delivered');
});
test('resume includes earlier attempts and still scopes every event to its node',()=>{
 const resumed={...node,startedAt:'2026-10-29T00:00:06Z',attempts:[{startedAt:'2026-10-29T00:00:01Z',finishedAt:'2026-10-29T00:00:04Z',status:'interrupted'}]};
 const task={teamRuns:[{...run,nodes:[resumed]}],events:[event('1','completed','old attempt',{teamNodeId:undefined}),event('2','completed','new attempt',{createdAt:'2026-10-29T00:00:08Z',teamNodeId:undefined})]};
 assert.equal(workflowNodeEvents(task,task.teamRuns[0],resumed).length,2);
});
