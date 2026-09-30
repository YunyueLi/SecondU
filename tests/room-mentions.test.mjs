import test from 'node:test';
import assert from 'node:assert/strict';
import {mentionQuery,updateInlineMentions,mentionRecipientIds} from '../src/agents/mentionQuery.ts';
test('member completion uses the caret and supports Chinese prose without a preceding space',()=>{
  assert.deepEqual(mentionQuery('@',1),{start:0,end:1,query:''});
  assert.deepEqual(mentionQuery('请@后端一起复核',4),{start:1,end:4,query:'后端'});
  assert.deepEqual(mentionQuery('Hi @Everyone, next',12),{start:3,end:12,query:'Everyone'});
});
test('inline mention IDs move with text and disappear when the mention is edited or removed',()=>{
  const original='请@后端工程师 看一下';
  const mentions=[{start:1,end:7,text:'@后端工程师',recipientIds:['actual-agent-id']}];
  const prefixed='今天'+original;
  const moved=updateInlineMentions(original,prefixed,mentions);
  assert.equal(moved[0].start,3);assert.deepEqual(mentionRecipientIds(prefixed,moved),['actual-agent-id']);
  assert.deepEqual(updateInlineMentions(original,'请看一下',mentions),[]);
  assert.deepEqual(updateInlineMentions(original,'请@前端工程师 看一下',mentions),[]);
  assert.deepEqual(mentionRecipientIds('@后端工程师 看一下',[]),[]);
});
test('everyone keeps the selected member IDs and removing its inline token clears them',()=>{
  const value='@everyone 你们好',mentions=[{start:0,end:9,text:'@everyone',recipientIds:['a','b','c']}];
  assert.deepEqual(mentionRecipientIds(value,mentions),['a','b','c']);
  assert.deepEqual(updateInlineMentions(value,'你们好',mentions),[]);
  assert.deepEqual(updateInlineMentions(value,'@everyonex 你们好',mentions),[]);
});
test('email addresses and completed mention tokens do not open the member picker',()=>{
  for(const value of ['person@example.com','a.b+alias@example.com','@后端 已选','普通文字'])assert.equal(mentionQuery(value,value.length),undefined,value);
});
