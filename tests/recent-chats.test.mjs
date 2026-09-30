import test from 'node:test';
import assert from 'node:assert/strict';
import {recentChatEntries,recentChatStatus} from '../src/recentChatEntries.ts';

const task=(id,extra={})=>({id,title:id,prompt:'A normal question',status:'completed',interaction:'chat',updatedAt:'2026-09-29T12:00:00Z',events:[],approvals:[],messages:[],...extra});
const room=(id,extra={})=>({id,title:id,updatedAt:'2026-09-29T13:00:00Z',taskIds:[],messages:[],...extra});
const data=(tasks=[],agentRooms=[],artifacts=[])=>({tasks,agentRooms,artifacts});

test('ordinary completed replies have no task outcome label in recent chats',()=>{
  const reply=task('ordinary');assert.equal(recentChatStatus(reply,data()),undefined);
  assert.equal(recentChatStatus({...reply,interaction:undefined},data()),undefined);
  assert.equal(recentChatStatus({...reply,status:'running'},data()),'running');
  assert.equal(recentChatStatus({...reply,status:'failed'},data()),'failed');
  assert.equal(recentChatStatus(reply,data([],[],[{taskId:reply.id,classification:'artifact'}])),undefined);
  assert.equal(recentChatStatus({...reply,status:'cancelled'},data()),undefined);
  assert.equal(recentChatStatus(reply,data([],[],[{taskId:'another',classification:'artifact'}])),undefined);
});

test('saved example revisions have no waiting-to-run label while executable drafts keep theirs',()=>{
  const revision=task('example-revision',{mode:'demo',status:'queued',forkedFrom:{taskId:'original',messageId:'question'}});
  assert.equal(recentChatStatus(revision,data()),undefined);
  assert.equal(recentChatStatus({...revision,mode:'live'},data()),'queued');
  assert.equal(recentChatStatus({...revision,forkedFrom:undefined},data()),'queued');
  assert.equal(recentChatStatus({...revision,status:'failed'},data()),'failed','real error states remain visible');
});

test('archiving hides the list entry but preserves room messages, tasks and full titles for restore',()=>{
  const fullTitle='用户确认的完整对话名称，单行展示但完整名称仍保留供查看';
  const child=task('child'),standalone=task('standalone',{title:fullTitle,archived:true});
  const chat=room('room',{taskIds:['child'],archived:true,messages:[{content:'Original message'}]});
  const fixture=data([child,standalone],[chat]);
  assert.deepEqual(recentChatEntries(fixture,''),[]);
  const archived=recentChatEntries(fixture,'',true);assert.deepEqual(archived.map(entry=>entry.id),['room','standalone']);assert.equal(archived[1].title,fullTitle);
  assert.equal(fixture.agentRooms[0].messages[0].content,'Original message');assert.equal(fixture.tasks.length,2);
  assert.deepEqual(recentChatEntries(data([{...standalone,archived:false}],[{...chat,archived:false}]),'').map(entry=>entry.id),['room','standalone']);
});

test('project chats remain findable in search and all archived chats can be restored',()=>{
  const project=task('project',{projectId:'project',archived:false}),archivedProject=task('archived project',{projectId:'project',archived:true});
  const fixture=data([project,archivedProject]);
  assert.deepEqual(recentChatEntries(fixture,''),[]);
  assert.deepEqual(recentChatEntries(fixture,'project').map(entry=>entry.id),['project']);
  assert.deepEqual(recentChatEntries(fixture,'',true).map(entry=>entry.id),['archived project']);
});

test('example workspaces expose project conversations once without hiding all authored chats',()=>{
  const direct=room('direct',{kind:'direct',projectId:'project',taskIds:['direct-child']}),group=room('group',{kind:'group',projectId:'project',taskIds:['group-child']});
  const fixture={...data([task('direct-child',{projectId:'project'}),task('group-child',{projectId:'project'}),task('standalone',{projectId:'project'})],[direct,group]),profile:{demo:true}};
  assert.deepEqual(recentChatEntries(fixture,'').map(entry=>entry.id),['direct','group','standalone']);
  assert.deepEqual(recentChatEntries(fixture,'group').map(entry=>entry.id),['group']);
  assert.equal(fixture.tasks.length,3,'presentation does not manufacture or replace execution records');
});

test('example project visibility preserves archival and does not spill into personal demo history',()=>{
  const fixture={...data([task('old-example',{projectId:'project',mode:'demo'}),task('archived-example',{projectId:'project',archived:true,mode:'demo'})]),profile:{demo:false}};
  assert.deepEqual(recentChatEntries(fixture,''),[]);
  assert.deepEqual(recentChatEntries({...fixture,profile:{demo:true}},'').map(entry=>entry.id),['old-example']);
  assert.deepEqual(recentChatEntries({...fixture,profile:{demo:true}},'',true).map(entry=>entry.id),['archived-example']);
});
