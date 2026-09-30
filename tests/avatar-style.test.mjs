import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../server/store.mjs';
import {batchAvatarStyle,defaultAgentAvatarStyle} from '../server/avatars.mjs';
import {createEntity} from '../server/domain.mjs';
import {expertDraft,EXPERT_TEMPLATES} from '../src/agents/expertTemplates.ts';
import {createApp} from '../server/index.mjs';

function fixture(t){const dir=mkdtempSync(path.join(os.tmpdir(),'hither-avatar-style-'));const store=new Store(dir,{seed:false});t.after(()=>{store.db.close();rmSync(dir,{recursive:true,force:true});});const agents=[{id:'a',name:'First',role:'A',instructions:'Keep A',createdAt:'2026-01-01'},{id:'b',name:'Second',role:'B',instructions:'Keep B',avatarStyle:'lorelei',avatarImage:'/api/avatars/uploaded.png',createdAt:'2026-01-02'}];for(const agent of agents)store.put('agents',agent);return {store,dir,agents};}
test('batch avatar styles keep uploaded images by default and count actual changes',t=>{
 const {store,agents}=fixture(t);const result=batchAvatarStyle(store,{avatarStyle:'notionists'});assert.equal(result.updated,2);assert(result.agents.every(agent=>agent.avatarStyle==='notionists'));assert.equal(result.agents[1].avatarImage,agents[1].avatarImage);assert.equal(result.agents[0].instructions,'Keep A');assert.equal(batchAvatarStyle(store,{avatarStyle:'notionists',replaceUploaded:false}).updated,0);
});
test('explicit uploaded replacement removes only references, never files',t=>{
 const {store,dir}=fixture(t);const file=path.join(dir,'retained-image.png');writeFileSync(file,'fixture');const result=batchAvatarStyle(store,{avatarStyle:'lorelei',replaceUploaded:true});assert.equal(result.updated,2);assert(result.agents.every(agent=>!agent.avatarImage));assert(existsSync(file));
});
test('invalid styles and boolean options leave all records untouched',t=>{
 const {store}=fixture(t);const before=store.list('agents');for(const body of [null,[],{},'pixelArt',{avatarStyle:'external'},{avatarStyle:'pixelArt',replaceUploaded:'true'},{avatarStyle:'pixelArt',replaceUploaded:null},{avatarStyle:'pixelArt',avatarImage:'/etc/passwd'}])assert.throws(()=>batchAvatarStyle(store,body),error=>error.status===400);assert.deepEqual(store.list('agents'),before);
});
test('a mid-batch storage failure rolls every change back',t=>{
 const {store}=fixture(t);const before=store.list('agents'),put=store.put.bind(store);let calls=0;store.put=(...args)=>{if(++calls===2)throw new Error('fixture write failure');return put(...args);};assert.throws(()=>batchAvatarStyle(store,{avatarStyle:'shapes'}),/fixture write failure/);assert.deepEqual(store.list('agents'),before);
});
test('the registered bulk endpoint persists changes and rejects invalid options',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'hither-avatar-route-'));const app=createApp({dataDir:dir,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 app.store.put('agents',{id:'route-agent',name:'Fixture',role:'Test',instructions:'Unchanged',createdAt:'2026-09-29'});
 const request=body=>fetch(`http://127.0.0.1:${app.server.address().port}/api/agents/avatar-style`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const good=await request({avatarStyle:'thumbs',replaceUploaded:false});assert.equal(good.status,200);const result=await good.json();assert.equal(result.updated,1);assert.equal(app.store.get('agents','route-agent').avatarStyle,'thumbs');
 assert.equal((await request({avatarStyle:'external'})).status,400);assert.equal(app.store.get('agents','route-agent').avatarStyle,'thumbs');
});

test('batch style persists as the default for manual, expert and source agents across restart',t=>{
 const {store,dir}=fixture(t);batchAvatarStyle(store,{avatarStyle:'thumbs'});
 const template=EXPERT_TEMPLATES.find(item=>item.id==='garden-care');
 for(const body of [{name:'Manual',role:'A'},{...expertDraft(template,'en','Expert',template.focuses[0].id)},{name:'Source',role:'Gardening',sourceUrl:'https://example.com/garden/care'}]){
   const agent=createEntity(store,'agents',body);assert.equal(agent.avatarStyle,'thumbs');store.put('agents',agent);
 }
 assert.equal(createEntity(store,'agents',{name:'Individual',avatarStyle:'micah'}).avatarStyle,'micah');
 const reopened=new Store(dir,{seed:false});try{assert.equal(defaultAgentAvatarStyle(reopened),'thumbs');assert.equal(createEntity(reopened,'agents',{name:'After restart'}).avatarStyle,'thumbs');}finally{reopened.db.close();}
});
test('legacy spaces retain a uniform generated style without replacing uploaded images',t=>{
 const {store}=fixture(t);store.put('agents',{...store.get('agents','a'),avatarStyle:'thumbs'});
 assert.equal(defaultAgentAvatarStyle(store),'thumbs');assert.equal(createEntity(store,'agents',{name:'Legacy new'}).avatarStyle,'thumbs');
 assert.equal(store.get('agents','b').avatarImage,'/api/avatars/uploaded.png');
});
test('a failed batch does not replace the previous persisted default',t=>{
 const {store}=fixture(t);batchAvatarStyle(store,{avatarStyle:'thumbs'});const setMeta=store.setMeta.bind(store);store.setMeta=(key,value)=>{setMeta(key,value);throw new Error('meta fixture failure');};
 assert.throws(()=>batchAvatarStyle(store,{avatarStyle:'shapes'}),/meta fixture failure/);assert.equal(defaultAgentAvatarStyle(store),'thumbs');assert(store.list('agents').every(agent=>agent.avatarStyle==='thumbs'));
});
