import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const dataUrl=`data:image/png;base64,${image.toString('base64')}`;
async function setup(t){
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-profile-avatar-'));
 let app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 let base=`http://127.0.0.1:${app.server.address().port}`;
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const request=(route,body,method=body?'PUT':'GET')=>fetch(base+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 return {directory,request,app,restart:async()=>{await app.close();app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;}};
}
test('profile avatar saves original raster locally, survives restart, updates independently and clears explicitly',async t=>{
 const f=await setup(t);f.app.store.setMeta('profile',{...f.app.store.meta('profile'),nationality:'fixture',demoLocale:'zh-CN'});
 const response=await f.request('/api/profile',{avatarDataUrl:dataUrl,name:'Avatar fixture'});assert.equal(response.status,200);
 const profile=await response.json();assert.match(profile.avatarImage,/^\/api\/avatars\/[a-f0-9-]+\.png$/);assert.equal(profile.nationality,'fixture');assert.equal(profile.demoLocale,'zh-CN');
 const file=await f.request(profile.avatarImage);assert.equal(file.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),image);
 assert.equal(statSync(path.join(f.directory,'avatars',path.basename(profile.avatarImage))).mode&0o777,0o600);
 assert.equal((await(await f.request('/api/profile',{description:'Changed independently'})).json()).avatarImage,profile.avatarImage);
 await f.restart();assert.equal((await(await f.request('/api/bootstrap')).json()).profile.avatarImage,profile.avatarImage);
 assert.equal((await(await f.request('/api/profile',{clearAvatar:true})).json()).avatarImage,undefined);
 // Clearing is reversible; it removes the profile reference, not a saved original.
 assert.equal((await f.request(profile.avatarImage)).status,200);
});
test('invalid and oversized avatar requests cannot mutate profile or accept URLs and active content',async t=>{
 const f=await setup(t),before=(await(await f.request('/api/bootstrap')).json()).profile;
 for(const body of [{avatarImage:'https://example.com/avatar.png'}, {avatarDataUrl:'data:image/svg+xml;base64,PHN2Zy8+'}, {avatarDataUrl:7}, {avatarDataUrl:dataUrl,clearAvatar:true}, {clearAvatar:'yes'}, {avatarDataUrl:'data:image/png;base64,'+Buffer.alloc(30).toString('base64')}]) {
   const r=await f.request('/api/profile',{name:'Should not persist',...body});assert.equal(r.status,400);await r.arrayBuffer();
 }
 const huge=await f.request('/api/profile',{avatarDataUrl:'data:image/png;base64,'+Buffer.alloc(3*1024*1024+1).toString('base64')});assert.equal(huge.status,413);await huge.arrayBuffer();
 assert.deepEqual((await(await f.request('/api/bootstrap')).json()).profile,before);
});
test('avatars stay inside their selected demo or personal space',async t=>{
 const f=await setup(t);await f.request('/api/spaces/demo-cn-v1',{},'POST');const profile=await(await f.request('/api/spaces/demo-cn-v1/profile',{avatarDataUrl:dataUrl})).json();
 assert.ok(profile.avatarImage);assert.equal((await f.request('/api/spaces/demo-cn-v1'+profile.avatarImage.slice(4))).status,200);
 assert.equal((await f.request(profile.avatarImage)).status,404);
 const personal=await(await f.request('/api/bootstrap')).json();assert.equal(personal.profile.avatarImage,undefined);
});
