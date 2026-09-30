import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationSemantics,recommendationPlatforms,resolveRecommendationIcon as resolve} from '../shared/recommendation-icons.ts';

test('explicit app and semantic type override content with compatible original mappings',()=>{
 assert.deepEqual(resolve({app:'msteams',kind:'feedback',text:'write a document'}),{type:'platform',id:'teams',platform:'teams',reason:'explicit-app'});
 assert.equal(resolve({kind:'presentation',text:'Send user feedback to Slack'}).id,'presentation');
 assert.equal(resolve({app:'unknown-app',kind:'trip'}).icon,'Calendar');
 assert.equal(resolve({kind:'feedback'}).icon,'Chat');
 assert.equal(resolve({kind:'presentation'}).icon,'FilePresentation');
 assert.equal(resolve({kind:'travel'}).id,'trip');
});
test('Chinese and English suggestions resolve locally with specific brands and task semantics',()=>{
 for(const [text,id] of [['整理用户反馈','feedback'],['Review user feedback','feedback'],['安排四天旅行行程','trip'],['Plan a travel itinerary','trip'],['整理本月预算','budget'],['Review the monthly budget','budget'],['翻译这段说明','translation'],['Translate this text','translation'],['整理企业微信的记录','wecom'],['整理Slack里的反馈','slack'],['Read my Google Chat messages','googlechat']])assert.equal(resolve({text}).id,id,text);
});
test('unknown content falls back without false English substring or ambiguous brand matches',()=>{
 assert.equal(resolve({text:'Something new',kind:'unknown',app:'unknown'}).id,'chat');
 assert.equal(resolve({text:'notes.xyz',fallback:'file'}).id,'file');
 assert.equal(resolve({text:'notes.md'}).id,'file');
 for(const text of ['one line','signal processing','matrix multiplication','budgetary wording','researcher profile'])assert.equal(resolve({text}).type,'semantic',text);
 assert.equal(resolve({text:'one line'}).id,'chat');
 assert.equal(resolve({text:'matrix multiplication'}).id,'chat');
});
test('registry IDs are unique and every entry can be selected explicitly',()=>{
 assert.equal(recommendationSemantics.length,28);
 assert.equal(new Set(recommendationSemantics.map(item=>item.id)).size,recommendationSemantics.length);
 assert.equal(new Set(recommendationPlatforms.map(item=>item.id)).size,recommendationPlatforms.length);
 for(const item of recommendationSemantics)assert.equal(resolve({kind:item.id}).id,item.id);
 for(const item of recommendationPlatforms)assert.equal(resolve({app:item.id}).id,item.id);
});
