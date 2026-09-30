import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server/index.mjs';
import { Store, HttpError } from '../server/store.mjs';
import { ARTWORK_LIMIT, defaultAppearance, getAppearance, getArtwork, getArtworkInfo } from '../server/local-appearance.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
const upload=data=>({mime:'image/png',base64:data.toString('base64')});
async function fixture(t,{dataDir}={}) {
  const directory=dataDir??mkdtempSync(path.join(os.tmpdir(),'hither-appearance-'));
  const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}/api/`;
  let closed=false;
  const close=async()=>{if(!closed){closed=true;await app.close();}};
  t.after(async()=>{await close();if(!dataDir)rmSync(directory,{recursive:true,force:true});});
  const request=(route,body,method=body===undefined?'GET':'PUT')=>fetch(base+route,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const api=async(...args)=>{const response=await request(...args);return {status:response.status,value:await response.json()};};
  return {app,directory,base,close,request,api};
}

// A standards-shaped ancillary PNG text chunk makes a genuinely large upload, without a large image allocation.
function largePng(size) {
  const data=Buffer.from('comment\0'+'a'.repeat(size));
  const type=Buffer.from('tEXt'),length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  let crc=0xffffffff;
  for (const byte of Buffer.concat([type,data])) {crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([png.subarray(0,-12),length,type,data,checksum,png.subarray(-12)]);
}

test('appearance starts unset, merges partial updates, rejects invalid fields without overwriting',async t=>{
  const f=await fixture(t);
  assert.deepEqual(await f.api('settings/appearance'),{status:200,value:null});
  assert.deepEqual((await f.api('settings/appearance',{theme:'dark'})).value,{...defaultAppearance,theme:'dark'});
  const saved=(await f.api('settings/appearance',{accent:'violet',fontSize:16,opacity:78,motion:'reduced',sendKey:'modifier',language:'en'})).value;
  assert.equal(saved.theme,'dark');assert.equal(saved.accent,'violet');assert.equal(saved.opacity,78);
  assert.equal(saved.language,'en');
  for(const value of [{theme:'sepia'},{atmosphere:'file:///tmp/picture'},{accent:'red'},{opacity:69},{opacity:101},{fontSize:19},{fontSize:'14'},{motion:true},{sendKey:'anything'},{language:'fr'},{language:null},{constructor:1},{unknown:true}]) {
    assert.equal((await f.api('settings/appearance',value)).status,400);
    assert.deepEqual((await f.api('settings/appearance')).value,saved);
  }
  assert.equal((await f.api('settings/appearance',{},'DELETE')).status,405);
});

test('independent windows preserve each other’s language and theme when saving field patches',async t=>{
  const f=await fixture(t);
  await f.api('settings/appearance',{theme:'light',language:'zh-CN'});
  const windowA=(await f.api('settings/appearance')).value;
  await f.api('settings/appearance',{language:'en'}); // Another window changes its language.
  assert.equal(windowA.language,'zh-CN'); // The first window still has an older snapshot.
  const themed=(await f.api('settings/appearance',{theme:'dark'})).value;
  assert.equal(themed.language,'en');assert.equal(themed.theme,'dark');
  const language=(await f.api('settings/appearance',{language:'zh-CN'})).value;
  assert.equal(language.theme,'dark');assert.equal(language.language,'zh-CN');
});

test('artwork validates content, serves exact private bytes and excludes image data from normal exports',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('settings/artwork')).status,404);
  assert.deepEqual(await f.api('settings/artwork/info'),{status:200,value:null});
  const saved=await f.api('settings/artwork',upload(png));assert.equal(saved.status,200);assert.match(saved.value.revision,/^[a-f0-9]{64}$/);
  assert.deepEqual((await f.api('settings/artwork/info')).value,{revision:saved.value.revision,mime:'image/png',bytes:png.length});
  const image=await f.request('settings/artwork');assert.equal(image.status,200);
  assert.equal(image.headers.get('content-type'),'image/png');assert.equal(image.headers.get('x-content-type-options'),'nosniff');
  assert.equal(image.headers.get('cache-control'),'private, no-store');assert.equal(image.headers.get('content-length'),String(png.length));
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  for(const body of [
    {...upload(png),mime:'image/jpeg'}, {mime:'image/png',base64:Buffer.from('<svg><script/></svg>').toString('base64')},
    {mime:'image/svg+xml',base64:Buffer.from('<svg/>').toString('base64')}, {...upload(png),path:'../../outside'},
    {mime:'image/png',base64:'data:image/png;base64,'+png.toString('base64')}, {mime:'image/png',base64:png.toString('base64')+'\n'},
    {mime:'image/png',base64:'AAAA$==='}, {mime:'image/png',base64:''}, {mime:'image/avif',base64:Buffer.from('ordinary mp4 is not avif').toString('base64')},
  ]) {
    assert.equal((await f.api('settings/artwork',body)).status,400);
    assert.equal((await f.api('settings/artwork/info')).value.revision,saved.value.revision);
  }
  for(const endpoint of ['bootstrap','export']) {
    const result=JSON.stringify((await f.api(endpoint)).value);
    assert.equal(result.includes(png.toString('base64')),false);assert.equal(result.includes('local-artwork'),false);
  }
});

test('appearance and artwork survive Store and HTTP server restarts independently of browser origin',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-appearance-restart-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const first=await fixture(t,{dataDir:directory});
  const appearance=(await first.api('settings/appearance',{theme:'light',atmosphere:'custom',accent:'green',language:'en'})).value;
  const artwork=(await first.api('settings/artwork',upload(png))).value;
  await first.close();
  const reopened=new Store(directory,{seed:false});
  assert.deepEqual(getAppearance(reopened),appearance);assert.deepEqual(getArtwork(reopened).data,png);assert.equal(getArtworkInfo(reopened).revision,artwork.revision);reopened.close();
  const second=await fixture(t,{dataDir:directory});
  assert.deepEqual((await second.api('settings/appearance')).value,appearance);
  assert.equal((await second.api('settings/artwork/info')).value.revision,artwork.revision);
  assert.deepEqual(Buffer.from(await (await second.request('settings/artwork')).arrayBuffer()),png);
  await second.close();
});

test('artwork has its own request limit while normal APIs stay at 2 MiB, invalid size preserves prior image',async t=>{
  const f=await fixture(t),large=largePng(2*1024*1024);
  const saved=await f.api('settings/artwork',upload(large));assert.equal(saved.status,200);
  assert.deepEqual(Buffer.from(await (await f.request('settings/artwork')).arrayBuffer()),large);
  assert.equal((await f.api('profile',{name:'x',description:'x'.repeat(2*1024*1024)})).status,413);
  assert.equal((await f.api('settings/artwork/info',{base64:'A'.repeat(3*1024*1024)})).status,413);
  assert.equal((await f.api('settings/artwork',{mime:'image/png',base64:Buffer.alloc(ARTWORK_LIMIT+1).toString('base64')})).status,413);
  assert.equal((await f.api('settings/artwork',{mime:'image/png',base64:'A'.repeat(12*1024*1024)})).status,413);
  assert.equal((await f.api('settings/artwork/info')).value.revision,saved.value.revision);
});

test('failed artwork metadata write rolls back bytes, metadata and survives reopen',async t=>{
  const f=await fixture(t);
  const before=(await f.api('settings/artwork',upload(png))).value;
  const original=f.app.store.setMeta.bind(f.app.store);
  f.app.store.setMeta=(key,value)=>{if(key==='local-artwork-info')throw new HttpError(503,'测试中的存储故障');return original(key,value);};
  assert.equal((await f.api('settings/artwork',upload(largePng(64)))).status,503);
  f.app.store.setMeta=original;
  assert.equal((await f.api('settings/artwork/info')).value.revision,before.revision);
  assert.deepEqual(Buffer.from(await (await f.request('settings/artwork')).arrayBuffer()),png);
  await f.close();
  const reopened=new Store(f.directory,{seed:false});
  assert.equal(getArtworkInfo(reopened).revision,before.revision);assert.deepEqual(getArtwork(reopened).data,png);reopened.close();
});
