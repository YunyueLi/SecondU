import test from 'node:test';
import assert from 'node:assert/strict';
import { taskConversationTurns } from '../src/taskConversation.ts';

const time = second => `2026-09-30T10:00:${String(second).padStart(2,'0')}.000Z`;
const fact = (statement,version=1) => ({id:'fact-budget',kind:'constraint',statement,status:'confirmed',version,sourceIds:['source-budget']});
const context = (id,second,entries) => ({id,type:'context',label:'Context',createdAt:time(second),detail:JSON.stringify(entries)});
const message = (id,role,second,extra={}) => ({id,role,content:id,createdAt:time(second),...extra});
const task = (patch={}) => ({id:'task-a',title:'A task',prompt:'A task',agentIds:[],contextFactIds:['fact-budget'],mode:'live',status:'running',createdAt:time(0),updatedAt:time(20),messages:[],events:[],artifactIds:[],approvals:[],...patch});

test('each reply keeps its recorded context and a later turn never replaces earlier evidence',()=>{
 const first=fact('Budget was 100',1),second=fact('Budget is 200',2);
 const original=task({messages:[message('u1','user',0),message('a1','assistant',3,{contextEventIds:{context:'c1'}}),message('u2','user',10),message('a2','assistant',13,{contextEventIds:{context:'c2'}})],events:[context('c1',1,[first]),{id:'done',type:'completed',label:'Done',createdAt:time(4)},context('c2',11,[second])]});
 const before=structuredClone(original),turns=taskConversationTurns(original,[fact('Today changed again',3)]);
 assert.equal(turns.length,2);assert.deepEqual(turns[0].context,[{id:first.id,statement:first.statement,status:first.status,sourceIds:first.sourceIds,version:first.version}]);assert.equal(turns[1].context[0].statement,second.statement);
 assert.equal(turns[0].status,'completed');assert.equal(turns[1].status,'running');assert.deepEqual(original,before);
});

test('one turn combines distinct role evidence once, retaining separate historical versions',()=>{
 const value=task({messages:[message('u1','user',0),message('a1','assistant',3,{contextEventIds:{context:'c1'}}),message('a2','assistant',7,{contextEventIds:{context:'c2'}})],events:[context('c1',1,[fact('Budget was 100',1)]),context('c2',5,[fact('Budget was 100',1),fact('Budget is 200',2)])]});
 const turns=taskConversationTurns(value);assert.equal(turns.length,1);assert.equal(turns[0].messages.length,3);assert.deepEqual(turns[0].context.map(row=>row.version),[1,2]);
});

test('empty or missing explicit evidence does not fall back to unrelated present-day facts',()=>{
 for(const contextEventIds of [{context:'missing'},{}]){
  const value=task({messages:[message('u1','user',0),message('a1','assistant',3,{contextEventIds})],events:[context('unlinked',1,[fact('Unrelated context')])]});
  assert.deepEqual(taskConversationTurns(value,[fact('Current profile')])[0].context,[]);
 }
 const noContext=task({messages:[message('u1','user',0)],events:[context('empty',1,[])]});
 assert.deepEqual(taskConversationTurns(noContext,[fact('Current profile')])[0].context,[]);
});

test('pending turns use selected facts only before execution and preserve errors and approval events',()=>{
 const selected=fact('Selected before execution');
 const queued=task({status:'queued',messages:[message('u1','user',0)]});
 assert.equal(taskConversationTurns(queued,[selected])[0].context[0].statement,selected.statement);
 assert.deepEqual(taskConversationTurns({...queued,status:'running'},[selected])[0].context,[]);
 const error={id:'error',type:'failed',label:'Tool failed',detail:'Inspect the failure',createdAt:time(4)};
 const approval={id:'approval',type:'approval_requested',label:'Confirm file write',detail:'One operation',createdAt:time(12)};
 const value=task({status:'awaiting_approval',messages:[message('u1','user',0),message('u2','user',10)],events:[error,approval]});
 const turns=taskConversationTurns(value);assert.equal(turns[0].status,'failed');assert.deepEqual(turns[0].events,[error]);assert.equal(turns[1].status,'awaiting_approval');assert.deepEqual(turns[1].events,[approval]);
});
