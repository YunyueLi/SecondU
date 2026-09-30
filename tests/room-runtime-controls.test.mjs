import test from 'node:test';
import assert from 'node:assert/strict';
import {roomRuntimeControls} from '../src/agents/roomRuntimeControls.ts';

test('digital twin mode uses persisted settings, never the number of context matches',()=>{
  const room={digitalTwinEnabled:false};
  assert.equal(roomRuntimeControls(room).digitalTwinEnabled,false);
  assert.equal(roomRuntimeControls(room,{digitalTwinEnabled:true,status:'interrupted',contextFactIds:[]}).digitalTwinEnabled,true);
  assert.equal(roomRuntimeControls({digitalTwinEnabled:true},{digitalTwinEnabled:false,status:'needs_input',contextFactIds:['old-fact']}).digitalTwinEnabled,false);
  assert.equal(roomRuntimeControls({}, {status:'interrupted',contextFactIds:[]}).digitalTwinEnabled,true,'legacy task defaults to enabled');
});

test('idle continuations permit configuration, execution and approval do not',()=>{
  for(const status of ['interrupted','needs_input','completed','failed','cancelled'])assert.equal(roomRuntimeControls({}, {status}).locked,false,status);
  for(const status of ['queued','running','awaiting_approval'])assert.equal(roomRuntimeControls({}, {status}).locked,true,status);
  assert.equal(roomRuntimeControls({},undefined,true).locked,true);
});
