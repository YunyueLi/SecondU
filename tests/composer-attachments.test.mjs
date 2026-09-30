import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttachmentDrafts} from '../src/composer/attachmentState.ts';

const image=(name='image.png')=>new File(['image bytes'],name,{type:'image/png'});
const attachment=file=>({id:`saved-${file.name}`,name:file.name,mime:file.type,size:file.size,kind:'image',url:'/api/attachments/saved'});
function fixture(upload,options={}){
  const created=[],revoked=[];
  const store=createAttachmentDrafts({upload,createUrl:file=>{const url=`blob:${file.name}`;created.push(url);return url;},revokeUrl:url=>revoked.push(url),...options});
  return {store,created,revoked};
}

test('all file entrances share limits and save original files without replacing previews',async()=>{
  const uploaded=[];const f=fixture(async file=>{uploaded.push(file);return attachment(file);},{maxFiles:2,maxBytes:20});
  const first=image('one.png'),second=image('two.png');
  await f.store.addFiles([first,second,image('overflow.png')]);
  assert.deepEqual(uploaded,[first,second]);assert.equal(f.store.getSnapshot().limitReached,true);
  assert.deepEqual(f.store.getSnapshot().items.map(item=>[item.status,item.previewUrl,item.attachment.name]),[['ready','blob:one.png','one.png'],['ready','blob:two.png','two.png']]);
  f.store.remove(f.store.getSnapshot().items[0].id);assert.deepEqual(f.revoked,['blob:one.png']);assert.equal(f.store.getSnapshot().limitReached,false);
  await f.store.addFiles([image('next.png')]);assert.equal(f.store.getSnapshot().items.length,2);
});

test('removing or clearing pending drafts aborts uploads and ignores late success',async()=>{
  const pending=[];const f=fixture((file,signal)=>new Promise(resolve=>pending.push({file,signal,resolve})));
  const first=f.store.addFiles([image('remove.png')]);const id=f.store.getSnapshot().items[0].id;
  f.store.remove(id);assert.equal(pending[0].signal.aborted,true);pending[0].resolve(attachment(pending[0].file));await first;
  assert.deepEqual(f.store.getSnapshot().items,[]);
  const second=f.store.addFiles([image('clear.png')]);f.store.clear();assert.equal(pending[1].signal.aborted,true);pending[1].resolve(attachment(pending[1].file));await second;
  assert.deepEqual(f.store.getSnapshot().items,[]);assert.deepEqual(f.revoked,['blob:remove.png','blob:clear.png']);
});

test('failed upload retains the original for explicit retry; another attempt cannot overwrite it',async()=>{
  let calls=0;const f=fixture(async file=>{calls++;if(calls===1)throw new Error('Local service unavailable');return attachment(file);});
  const file=image();await f.store.addFiles([file]);const failed=f.store.getSnapshot().items[0];
  assert.equal(failed.status,'error');assert.equal(failed.file,file);assert.equal(failed.error.message,'Local service unavailable');
  await f.store.retry(failed.id);assert.equal(calls,2);assert.equal(f.store.getSnapshot().items[0].status,'ready');assert.equal(f.store.getSnapshot().items[0].error,undefined);
  f.store.clear();assert.deepEqual(f.revoked,['blob:image.png']);
});

test('empty and oversized files remain visible errors without making an upload request',async()=>{
  let calls=0;const f=fixture(async file=>{calls++;return attachment(file);},{maxBytes:4});
  await f.store.addFiles([new File([],'empty.txt'),image('large.png')]);
  assert.equal(calls,0);assert.deepEqual(f.store.getSnapshot().items.map(item=>item.error.code),['empty','too_large']);assert.deepEqual(f.created,[]);
});
