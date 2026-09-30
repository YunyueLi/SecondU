import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readFileSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { computeRuntimeRevision, runtimeRevision } from '../server/runtime-revision.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { backendIdentityMatches, selectBackendPort } = createRequire(import.meta.url)('../desktop/startup.cjs');
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-revision-'));
  for (const folder of ['server/remote','shared','dist']) mkdirSync(path.join(directory,folder),{recursive:true});
  writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'hither-desktop',version:'0.1.0',type:'module'}));
  writeFileSync(path.join(directory,'server/index.mjs'),'export const protocol = 1;');
  writeFileSync(path.join(directory,'server/remote/worker.mjs'),'export const remote = true;');
  writeFileSync(path.join(directory,'shared/contracts.ts'),'export type State = "draft";');
  writeFileSync(path.join(directory,'dist/index.html'),'<script src="/assets/index-first.js"></script>');
  return directory;
}

test('the development checkout and its minimal desktop package share a content-based identity',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-packaged-revision-'));
 try {
  cpSync(path.join(root,'server'),path.join(directory,'server'),{recursive:true});
  cpSync(path.join(root,'shared'),path.join(directory,'shared'),{recursive:true});
  if(existsSync(path.join(root,'dist/index.html'))){
   mkdirSync(path.join(directory,'dist'));
   writeFileSync(path.join(directory,'dist/index.html'),readFileSync(path.join(root,'dist/index.html')));
  }
  const manifest=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:manifest.name,version:manifest.version,type:manifest.type,hitherPackaged:true,main:'desktop/main.cjs'}));
  assert.equal(computeRuntimeRevision(directory),computeRuntimeRevision(root));
  assert.match(runtimeRevision,/^[a-f0-9]{64}$/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('runtime code, nested files, contracts and client-build updates change the identity',()=>{
 const directory=fixture();
 try {
  let previous=computeRuntimeRevision(directory);
  for(const [relative,content] of [['server/index.mjs','export const protocol = 2;'],['server/remote/worker.mjs','export const remote = false;'],['shared/contracts.ts','export type State = "done";'],['dist/index.html','<script src="/assets/index-second.js"></script>'],['package.json',JSON.stringify({name:'hither-desktop',version:'0.2.0',type:'module'})]]){
   writeFileSync(path.join(directory,relative),content);
   const next=computeRuntimeRevision(directory);assert.notEqual(next,previous,relative);previous=next;
  }
  renameSync(path.join(directory,'server/remote/worker.mjs'),path.join(directory,'server/remote/replacement.mjs'));
  assert.notEqual(computeRuntimeRevision(directory),previous);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('private runtime data, logs and packaging-only metadata never enter the build identity',()=>{
 const directory=fixture();
 try {
  const expected=computeRuntimeRevision(directory);
  mkdirSync(path.join(directory,'.hither'));
  writeFileSync(path.join(directory,'.hither','credentials.json'),'private-data-that-is-never-read');
  writeFileSync(path.join(directory,'server','runtime.log'),'non-source runtime log');
  writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'hither-desktop',version:'0.1.0',type:'module',hitherPackaged:true,main:'desktop/main.cjs',scripts:{dev:'vite'}}));
  assert.equal(computeRuntimeRevision(directory),expected);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('HTTP health exposes the captured revision and startup leaves an older listener untouched',async()=>{
 const { createApp } = await import('../server/index.mjs');
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-health-revision-'));
 const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
 const old=http.createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({application:'hither-desktop',version:'0.1.0',status:'ok',spaceId:health.spaceId}));});
 let health;
 try {
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const currentPort=app.server.address().port;
  health=await (await fetch(`http://127.0.0.1:${currentPort}/api/health`)).json();
  assert.equal(health.revision,runtimeRevision);
  const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
  assert.equal(health.version,version);
  const expected={application:'hither-desktop',version,spaceId:health.spaceId,revision:runtimeRevision};
  assert.equal(backendIdentityMatches(health,expected),true);
  await new Promise(resolve=>old.listen(0,'127.0.0.1',resolve));
  const oldPort=old.address().port;
  const probe=async port=>({occupied:true,value:await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()});
  assert.deepEqual(await selectBackendPort([oldPort,currentPort],probe,expected),{port:currentPort,reuse:true});
  assert.equal(old.listening,true);
  assert.equal((await probe(oldPort)).value.revision,undefined);
 }finally{
  if(old.listening)await new Promise(resolve=>old.close(resolve));
  await app.close();rmSync(directory,{recursive:true,force:true});
 }
});
