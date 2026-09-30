import test from 'node:test';
import assert from 'node:assert/strict';
import {showRoomTaskSummary,showRoomTaskProgress} from '../src/agents/roomTaskPresentation.ts';
import {planTurn} from '../server/turn-policy.mjs';

const lifecycle=['created','room','started','context','evidence','agent_started','agent_model','runtime.connecting','runtime.thread','runtime.message','runtime.completed','agent_completed','completed'];
const reply=(content='啥意思')=>({id:'task',roomId:'room',interaction:'chat',prompt:content,status:'completed',messages:[{role:'user',content}],approvals:[],events:lifecycle.map(type=>({type}))});
const planned=(task,overrides={})=>({...task,events:[...task.events,{type:'turn_plan',detail:JSON.stringify({...planTurn(task,[{id:'agent',name:'面试陪练'}]),...overrides})}]});

test('completed ordinary answers have no closeout strip regardless of wording or mentions',()=>{
  for(const content of ['hi','你是谁？','啥意思','解释一下你刚才的话','为什么这么说？','继续聊聊这个想法','帮我整理需求','@后端工程师 这个错误是什么原因','@不认识的用户 hi']){
    assert.equal(showRoomTaskSummary(planned(reply(content)),[],['后端工程师']),false,content);
    assert.equal(showRoomTaskSummary(reply(content),[]),false,content+' without a plan');
  }
  assert.equal(showRoomTaskSummary({...reply(),events:[...reply().events,{type:'runtime.reasoning_summary',detail:'Public explanation'},{type:'runtime.progress',detail:'Preparing an answer'}]},[]),false);
});

test('legacy replies without interaction or intent metadata stay plain, including archived reply snapshots',()=>{
  const legacy={...reply(),interaction:undefined};
  assert.equal(showRoomTaskSummary(legacy,[]),false);
  assert.equal(showRoomTaskSummary({...legacy,events:[...legacy.events,{type:'artifact_saved'},{type:'artifact_classified'}]},[{taskId:'task',classification:'reply_snapshot'}]),false);
  assert.equal(showRoomTaskSummary(planned(legacy,{kind:'task',conversationOnly:false}),[]),false);
  for(const detail of ['invalid json','null','{}'])assert.equal(showRoomTaskSummary({...reply(),events:[{type:'turn_plan',detail}]},[]),false,detail);
});

test('explicit task entry and in-chat file requests retain their closeout, using the latest recorded plan',()=>{
  assert.equal(showRoomTaskSummary({...reply('整理需求'),interaction:'task'},[]),true);
  assert.equal(showRoomTaskSummary(planned(reply('整理后保存 Markdown 文件')),[]),true);
  const task=planned(reply('生成 Markdown 文件'));
  assert.equal(showRoomTaskSummary({...task,messages:[...task.messages,{role:'user',content:'啥意思'}],events:[...task.events,{type:'turn_plan',detail:JSON.stringify({kind:'discussion',conversationOnly:true})}]},[]),false);
});

test('actual work, outputs, approvals and actionable problems stay visible after any reply',()=>{
  for(const type of ['runtime.action','runtime.action_failed','approval_requested','runtime.approval','artifact_pending','artifact_collection_warning','artifact_conflict','configuration_required','runtime.unsupported'])assert.equal(showRoomTaskSummary({...reply(),events:[{type}]},[]),true,type);
  assert.equal(showRoomTaskSummary(reply(),[{taskId:'task',classification:'artifact'}]),true);
  assert.equal(showRoomTaskSummary(reply(),[{taskId:'task'}]),true,'legacy real artifact');
  assert.equal(showRoomTaskSummary(reply(),[{taskId:'other-task',classification:'artifact'}]),false,'another task output cannot promote this reply');
  assert.equal(showRoomTaskSummary({...reply(),approvals:[{status:'approved'}]},[]),true);
  assert.equal(showRoomTaskSummary({...reply(),approvals:[{status:'pending'}]},[]),true);
  for(const status of ['running','queued','awaiting_approval','needs_input','interrupted','failed','cancelled'])assert.equal(showRoomTaskSummary({...reply(),status},[]),true,status);
  assert.equal(showRoomTaskSummary({...reply(),error:'Failure'},[]),true);
});

test('room progress requires recorded work, including connector calls, and ignores ordinary reply bookkeeping',()=>{
  for(const status of ['queued','running','completed','interrupted'])assert.equal(showRoomTaskProgress({...reply(),status},[]),false,status);
  assert.equal(showRoomTaskProgress({...reply(),interaction:'task'},[]),false,'intent alone is not execution evidence');
  assert.equal(showRoomTaskProgress(reply(),[{taskId:'other-task'}]),false);
  assert.equal(showRoomTaskProgress(reply(),[{taskId:'task',classification:'reply_snapshot'}]),false);
  assert.equal(showRoomTaskProgress(reply(),[{taskId:'task',classification:'artifact'}]),true);
  for(const type of ['runtime.action','connector.call','connector.result','runtime.plan'])assert.equal(showRoomTaskProgress({...reply(),events:[{type,detail:'recorded operation'}]},[]),true,type);
  const recovered={...reply(),events:[{type:'configuration_required'},...reply().events]};
  assert.equal(showRoomTaskProgress(recovered,[]),false,'resolved setup failure is not completed work');
  assert.equal(showRoomTaskProgress({...recovered,status:'needs_input'},[]),true,'the unresolved setup issue remains actionable');
});
