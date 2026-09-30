import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupRequest, StartupTimeoutError } from '../src/startupRequest.ts';

test('a stalled workspace request settles instead of keeping the startup screen pending',async()=>{
  const request=createStartupRequest(()=>new Promise(()=>{}),20);
  await assert.rejects(request.promise,StartupTimeoutError);
  assert.equal(request.signal.aborted,true);
});

test('Strict Mode cleanup cancels a request before the load begins',async()=>{
  let calls=0;
  const request=createStartupRequest(async()=>{calls++;return 'stale';});
  request.abort();
  await assert.rejects(request.promise,{name:'AbortError'});
  assert.equal(calls,0);
});

test('unmount settles an in-flight request even when the transport does not settle',async()=>{
  let signal;
  const request=createStartupRequest(value=>{signal=value;return new Promise(()=>{});});
  await Promise.resolve();
  request.abort();
  await assert.rejects(request.promise,{name:'AbortError'});
  assert.equal(signal.aborted,true);
  const retry=createStartupRequest(async()=>({loaded:true}));
  assert.deepEqual(await retry.promise,{loaded:true});
});

test('normal service failures remain inspectable and a completed request clears its timeout',async()=>{
  const failure=new Error('Service disconnected');
  const failed=createStartupRequest(async()=>{throw failure;});
  await assert.rejects(failed.promise,error=>error===failure);
  const completed=createStartupRequest(async()=>42,20);
  assert.equal(await completed.promise,42);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(completed.signal.aborted,false);
});
