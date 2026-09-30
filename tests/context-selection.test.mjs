import test from 'node:test';import assert from 'node:assert/strict';
import {selectTaskContext} from '../src/contextSelection.ts';
const fact=(id,kind,statement,status='confirmed')=>({id,kind,statement,status,sourceIds:['source'],version:1,history:[],updatedAt:'2026-09-29'});
test('personal context selects relevant confirmed evidence without promoting candidates',()=>{
 const facts=[fact('style','preference','回答简短而清晰'),fact('budget','constraint','声音展预算不超过800元'),fact('diet','constraint','旅行时需要素食餐厅'),fact('guess','constraint','声音展预算可以翻倍','inferred')];
 assert.deepEqual(selectTaskContext(facts,'帮我安排声音展本周筹备'),['budget']);
 assert.deepEqual(selectTaskContext(facts,'Plan a garden'),[]);
 assert.deepEqual(selectTaskContext(facts,'hi'),[]);
});
test('context selection respects confirmed status, caller exclusions, and the eight-entry cap',()=>{
 const facts=Array.from({length:20},(_,i)=>fact(`f${i}`,'preference','Clear answers'));
 assert.equal(selectTaskContext(facts,'Give clear answers').length,8);
 assert.deepEqual(selectTaskContext([fact('retired','identity','My profile','superseded')],'My profile'),[]);
 assert.deepEqual(selectTaskContext([],'工作计划'),[]);
});
test('English context matches whole words, not substrings inside unrelated words',()=>{
 const facts=[fact('canada','constraint','Canada'),fact('party','constraint','Birthday party'),fact('art','constraint','Art gallery closes at five'),fact('planet','constraint','Planet observation')];
 assert.deepEqual(selectTaskContext(facts,'Can you help?'),[]);
 assert.deepEqual(selectTaskContext(facts,'Find ART.'),['art']);
 assert.deepEqual(selectTaskContext(facts,'Plan a visit'),[]);
 assert.deepEqual(selectTaskContext(facts,'Visit Canada!'),['canada']);
});
test('English function words do not retrieve unrelated constraints or baseline preferences',()=>{
 const facts=[fact('unrelated','constraint','Please help with their needs'),fact('style','preference','Clear answers'),fact('budget','constraint','The exhibition budget is 800'),fact('candidate','constraint','Exhibition budget is 900','candidate')];
 assert.deepEqual(selectTaskContext(facts,'Would you please help with this?'),[]);
 assert.deepEqual(selectTaskContext(facts,'What is the EXHIBITION budget?'),['budget']);
 assert.deepEqual(selectTaskContext(facts,'Use clear answers'),['style']);
});
test('product identity and social questions never inject personal identity or values',()=>{
 const facts=[fact('identity','identity','我的数字分身是个人 Agent'),fact('style','preference','我的超级助理回答简短'),fact('consent','value','先确认许可再处理用户资料'),fact('budget','constraint','Agent 工作台内测预算 2000 元')];
 for(const prompt of ['你是谁？','你不是我的数字分身吗','你是我的超级助理？','你们好','谢谢大家','Who are you?','Are you my digital twin?'])assert.deepEqual(selectTaskContext(facts,prompt),[],prompt);
 assert.deepEqual(selectTaskContext(facts,'今天有点累'),[]);
 assert.deepEqual(selectTaskContext(facts,'请核对内测预算'),['budget']);
 assert.deepEqual(selectTaskContext(facts,'整理用户资料，先检查许可'),['consent']);
});
test('whole-word matching handles punctuation and mixed Chinese and English requests',()=>{
 const facts=[fact('airport','constraint','Use the airport entrance'),fact('port','constraint','The port closes at six'),fact('budget','constraint','声音展 budget 不超过800元')];
 assert.deepEqual(selectTaskContext(facts,'Port: access?'),['port']);
 assert.deepEqual(selectTaskContext(facts,'帮我核对声音展 BUDGET。'),['budget']);
});
