import test from 'node:test';
import assert from 'node:assert/strict';
import {workbenchLayout,workbenchKeyWidth,WORKBENCH_DEFAULT_WIDTH,WORKBENCH_CHAT_MIN_WIDTH} from '../src/workbench/layout.mjs';

test('panel drag bounds reserve readable chat space and never overflow the actual content container',()=>{
 for(const available of [0,280,390,680,759,760,820,1100,2000])for(const preferred of [-50,320,520,900,99999,NaN]){
  const layout=workbenchLayout(available,preferred);
  assert.ok(layout.width>=0&&layout.width<=available);assert.ok(layout.width>=layout.min&&layout.width<=layout.max);
  if(!layout.overlay)assert.ok(available-layout.width>=WORKBENCH_CHAT_MIN_WIDTH);
 }
});
test('viewport contraction clamps effective width without consuming the remembered split preference',()=>{
 const preference=820;
 assert.equal(workbenchLayout(1400,preference).width,820);
 assert.equal(workbenchLayout(800,preference).width,440);
 assert.equal(workbenchLayout(390,preference).width,390);
 assert.equal(workbenchLayout(1400,preference).width,820);
 assert.equal(workbenchLayout(1200).width,WORKBENCH_DEFAULT_WIDTH);
});
test('separator arrows match its right-hand panel direction, with accelerated and bounded keyboard steps',()=>{
 const bounds=workbenchLayout(1200,520);
 assert.equal(workbenchKeyWidth('ArrowLeft',520,bounds),540);
 assert.equal(workbenchKeyWidth('ArrowRight',520,bounds,true),440);
 assert.equal(workbenchKeyWidth('Home',520,bounds),bounds.min);
 assert.equal(workbenchKeyWidth('End',520,bounds),bounds.max);
 assert.equal(workbenchKeyWidth('ArrowRight',bounds.min,bounds),bounds.min);
 assert.equal(workbenchKeyWidth('ArrowLeft',bounds.max,bounds),bounds.max);
 assert.equal(workbenchKeyWidth('Tab',520,bounds),undefined);
});
