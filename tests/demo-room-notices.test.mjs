import test from 'node:test';
import assert from 'node:assert/strict';
import v3 from '../server/fixtures/demo-baseline-v3.json' with {type:'json'};
import v4 from '../server/fixtures/demo-baseline-v4.json' with {type:'json'};
import v5 from '../server/fixtures/demo-baseline-v5.json' with {type:'json'};
import {localizeDemoBootstrap,canonicalDemoValue} from '../shared/demo-localization.mjs';

const notices={
 'zh-CN':'可以修改示例内容与配置。实际执行任务时，请切换到自己的空间。',
 en:'You can edit this example and its settings. Switch to your own space to run tasks.',
};
const bootstrap=agentRooms=>({profile:{name:'万叶',demo:true},agentRooms:structuredClone(agentRooms)});

test('persisted v3, v4 and v5 system notices display the current editable configuration and execution boundary in both languages',()=>{
 for(const baseline of [v3,v4,v5]){
  const raw=bootstrap(baseline.expansion.agentRooms),before=structuredClone(raw);
  for(const locale of ['zh-CN','en']){
   const display=localizeDemoBootstrap(raw,locale);
   assert.equal(display.agentRooms.length,4);
   for(let n=0;n<raw.agentRooms.length;n++){
    const room=display.agentRooms[n],original=raw.agentRooms[n];
    assert.equal(room.messages[0].content,notices[locale]);
    assert.deepEqual({...room.messages[0],content:original.messages[0].content},original.messages[0]);
    assert.deepEqual(room.taskIds,original.taskIds);
    assert.equal(room.mode,'demo');
    assert.deepEqual(canonicalDemoValue('agentRooms',room.id,room,locale,original),original);
   }
  }
  assert.deepEqual(raw,before);
 }
});

test('edited notices, copied user messages and unmatched message identities remain verbatim',()=>{
 const original=structuredClone(v4.expansion.agentRooms[0]);
 const cases=[
  {...original,id:'user-room'},
  {...original,demo:false},
  {...original,mode:'live'},
  {...original,messages:[{...original.messages[0],id:'user-message'}]},
  {...original,messages:[{...original.messages[0],role:'user'}]},
  {...original,messages:[{...original.messages[0],demo:false}]},
  {...original,messages:[{...original.messages[0],content:`${original.messages[0].content} 用户补充。`}]},
 ];
 for(const room of cases)for(const locale of ['zh-CN','en'])assert.deepEqual(localizeDemoBootstrap(bootstrap([room]),locale).agentRooms[0].messages,room.messages);
 const ownMessages=[original.messages[0].content,v5.expansion.agentRooms[0].messages[0].content,notices.en].map((content,n)=>({id:`user-message-${n}`,role:'user',content,createdAt:original.createdAt}));
 const room={...original,messages:[...original.messages,...ownMessages]};
 const display=localizeDemoBootstrap(bootstrap([room]),'en').agentRooms[0];
 assert.deepEqual(display.messages.slice(1),ownMessages);
 const edited={...display,messages:[{...display.messages[0],content:'My own replacement'},{...display.messages[0],role:'user'}]};
 const restored=canonicalDemoValue('agentRooms',room.id,edited,'en',room);
 assert.equal(restored.messages[0].content,'My own replacement');
 assert.equal(restored.messages[1].content,notices.en);
});

test('real spaces and profiles without an explicit demo marker are never rewritten',()=>{
 for(const demo of [false,undefined]){
  const raw=bootstrap(v4.expansion.agentRooms);raw.profile.demo=demo;const before=structuredClone(raw);
  for(const locale of ['zh-CN','en'])assert.equal(localizeDemoBootstrap(raw,locale),raw);
  assert.deepEqual(raw,before);
 }
});
