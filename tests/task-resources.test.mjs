import test from 'node:test';
import assert from 'node:assert/strict';
import { taskResources } from '../src/taskResourceData.ts';

const evidence=(sources)=>({type:'evidence',detail:JSON.stringify({sources})});
const source=(id,excerpt)=>({id,title:id,excerpt,truncated:false});
const task=(id,events=[],attachmentIds=[])=>({id,events,messages:[{attachmentIds}]});
const data={artifacts:[{id:'file-a',taskId:'a'},{id:'reply-a',taskId:'a',classification:'reply_snapshot'},{id:'file-b',taskId:'b'}],attachments:[{id:'image-a'},{id:'image-b'}],facts:[{id:'fact',sourceIds:['new-source']}],sources:[{id:'old-source',text:'changed after execution'}]};

test('resource overview only includes selected task files and message attachments',()=>{
  const result=taskResources(data,[task('a',[],['image-a'])]);
  assert.deepEqual(result.files.map(item=>item.id),['file-a']);
  assert.deepEqual(result.attachments.map(item=>item.id),['image-a']);
});
test('resources preserve the latest recorded evidence and do not substitute mutable current facts',()=>{
  const result=taskResources(data,[task('a',[evidence([source('old-source','earlier turn')]),evidence([source('old-source','exact excerpt at execution')])])]);
  assert.deepEqual(result.sources,[{...source('old-source','exact excerpt at execution'),taskId:'a'}]);
  assert.deepEqual(taskResources(data,[task('a',[evidence([source('old-source','old')]),{type:'evidence',detail:'invalid'}])]).sources,[]);
});
test('room overview combines tasks without hiding different historical source excerpts',()=>{
  const result=taskResources(data,[task('a',[evidence([source('same','first')])]),task('b',[evidence([source('same','second'),source('same','first'),{id:'bad',title:'bad'}])])]);
  assert.deepEqual(result.sources.map(item=>item.excerpt),['first','second']);
  assert.deepEqual(result.files.map(item=>item.id),['file-a','file-b']);
});
