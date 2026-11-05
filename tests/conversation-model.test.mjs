import test from 'node:test';
import assert from 'node:assert/strict';
import {continuesMessage,roomAttention} from '../src/agents/conversationModel.ts';
const message=(extra={})=>({id:'m',role:'assistant',agentId:'a',taskId:'t',content:'update',createdAt:'2026-10-29T09:00:00Z',...extra});
test('consecutive replies share an identity only within the same short task sequence',()=>{
 const a=message(),b=message({id:'next',createdAt:'2026-10-29T09:02:00Z'});
 assert.equal(continuesMessage(a,b),true);
 for(const patch of [{role:'user'},{role:'system'},{agentId:'b'},{taskId:'other'},{taskId:undefined},{demo:true},{replyToMessageId:'quote'},{attachmentIds:['file']},{createdAt:'2026-10-29T09:06:00Z'},{createdAt:'invalid'},{createdAt:'2026-10-29T08:59:59Z'}])assert.equal(continuesMessage(a,{...b,...patch}),false,JSON.stringify(patch));
 assert.equal(continuesMessage(a,b,true),false,'deliverables and collaboration are boundaries');
 assert.equal(continuesMessage({...a,attachmentIds:['file']},b),false);
 assert.equal(continuesMessage(undefined,b),false);
});
test('a local day boundary retains an identity even across a short gap',()=>{
 const a=new Date(2026,9,29,23,59,59),b=new Date(2026,9,30,0,0,1);
 assert.equal(continuesMessage(message({createdAt:a.toISOString()}),message({createdAt:b.toISOString()})),false);
});
test('waiting, failure and stopped states are distinguished from live work',()=>{
 assert.equal(roomAttention({status:'needs_input'}),'input');assert.equal(roomAttention({status:'failed'}),'failed');
 for(const status of ['cancelled','interrupted'])assert.equal(roomAttention({status}),'stopped');
 assert.equal(roomAttention({status:'queued'}),'queued');
 for(const status of ['running','awaiting_approval','completed'])assert.equal(roomAttention({status}),undefined);
});

import {conversationMessages} from '../src/agents/conversationModel.ts';
test('public progress coalesces by message identity and excludes final duplicates, child events and reasoning',()=>{
 const room={taskIds:['t'],messages:[message({id:'u',role:'user',createdAt:'2026-10-29T08:59:00Z'}),message({id:'answer',createdAt:'2026-10-29T09:01:00Z'})]};
 const event=(id,extra={})=>({id,createdAt:'2026-10-29T09:00:00Z',agentId:'a',type:'runtime.message',detail:'First update',activity:{kind:'message',phase:'completed',callId:'first',messagePhase:'commentary'},...extra});
 const task={id:'t',mode:'live',team:{leadAgentId:'a'},teamRuns:[{nodes:[{id:'child',kind:'worker'}]}],events:[event('1'),event('2',{detail:'Updated text'}),event('3',{agentId:'worker'}),event('4',{teamNodeId:'child'}),event('5',{activity:{kind:'message',messagePhase:'final_answer'}}),event('6',{type:'runtime.reasoning_summary'})]};
 const result=conversationMessages(room,[task,{...task,id:'another-task'}]);assert.deepEqual(result.map(m=>m.id),['u','progress-t-1','answer']);assert.equal(result[1].content,'Updated text');assert.equal(result[1].progress,true);assert.equal(result[1].taskMessageId,undefined);
});

import {workflowAssignmentText} from '../src/agents/workflowMessage.ts';
test('only generated parameter wrappers become readable labels; custom instructions stay intact',()=>{
 const run={configuration:{program:{args:{topic:'晨光',attendees:12},parameters:[{name:'topic',label:'主题'},{name:'attendees',label:'人数'}]}}};
 const raw=JSON.stringify(run.configuration.program.args),node={objective:'整理安排。\n\n本次脚本输入：'+raw+'\n\n流程参数：'+raw};
 assert.equal(workflowAssignmentText(node,run),'整理安排。\n\n主题：晨光；人数：12');
 assert.equal(workflowAssignmentText({objective:'自定义指令：'+raw},run),'自定义指令：'+raw);
 assert.equal(workflowAssignmentText(node,{}),node.objective);
});
