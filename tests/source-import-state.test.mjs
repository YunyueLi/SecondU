import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceImportTransaction} from '../src/cognition/sourceImportState.ts';

const source={id:'source-saved',title:'Local source',text:'Original text',kind:'note'};

test('refresh failure preserves the saved source and retries never write it again',async()=>{
  const transaction=createSourceImportTransaction();
  let writes=0,refreshes=0;
  const create=async()=>{writes++;return source;};
  assert.equal(await transaction.commit(create),source);
  await assert.rejects(transaction.refresh(async()=>{refreshes++;throw new Error('Refresh unavailable');}),/Refresh unavailable/);
  assert.equal(transaction.committed,source);
  assert.equal(await transaction.commit(create),source);
  await assert.rejects(transaction.refresh(async()=>{refreshes++;throw new Error('Still unavailable');}),/Still unavailable/);
  assert.equal(await transaction.refresh(async()=>{refreshes++;}),source);
  assert.equal(writes,1);
  assert.equal(refreshes,3);
  assert.equal(transaction.committed,source);
});

test('concurrent save clicks share the same write and retain the original attachment ids',async()=>{
  const transaction=createSourceImportTransaction();
  const mediaSource={...source,attachmentIds:['original-photo','original-video']};
  let finish,writes=0;
  const create=()=>{writes++;return new Promise(resolve=>{finish=resolve;});};
  const first=transaction.commit(create),second=transaction.commit(create);
  await Promise.resolve();
  assert.equal(writes,1);
  finish(mediaSource);
  assert.equal(await first,mediaSource);
  assert.equal(await second,mediaSource);
  assert.deepEqual(transaction.committed.attachmentIds,['original-photo','original-video']);
});

test('a failed save can retry while the next import starts only after explicit completion',async()=>{
  const transaction=createSourceImportTransaction();
  await assert.rejects(transaction.commit(async()=>{throw new Error('Save unavailable');}),/Save unavailable/);
  assert.equal(transaction.committed,undefined);
  assert.equal(await transaction.commit(async()=>source),source);
  await transaction.refresh(async()=>{});
  transaction.reset();
  const next={...source,id:'source-next'};
  assert.equal(await transaction.commit(async()=>next),next);
});
