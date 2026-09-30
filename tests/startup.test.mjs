import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url);
const {startupHtml,writeStartupDocument,initialWindowBounds,readStartupAppearance,backendIdentityMatches,selectBackendPort,RETRY_URL}=require('../desktop/startup.cjs');
const root=path.resolve(import.meta.dirname,'..');
test('native bootstrap reads only the personal appearance without creating or migrating data',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-startup-'));
 try {
  assert.deepEqual(readStartupAppearance(directory),{appearance:{}});
  const personal=path.join(directory,'spaces','personal');mkdirSync(personal,{recursive:true});
  const file=path.join(personal,'hither.sqlite'),db=new DatabaseSync(file);
  db.exec('CREATE TABLE entities(collection TEXT,id TEXT,data TEXT,PRIMARY KEY(collection,id))');
  db.prepare('INSERT INTO entities VALUES(?,?,?)').run('meta','appearance',JSON.stringify({id:'appearance',value:{theme:'dark',fontSize:18,motion:'reduced',language:'en'}}));
  db.prepare('INSERT INTO entities VALUES(?,?,?)').run('private','secret',JSON.stringify({value:'must not appear'}));db.close();
  const before=readFileSync(file);
  assert.deepEqual(readStartupAppearance(directory),{appearance:{theme:'dark',fontSize:18,motion:'reduced',language:'en'}});
  assert.deepEqual(readFileSync(file),before);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('native failure is escaped and uses a local explicit retry with saved appearance',()=>{
 const html=startupHtml(root,{error:'<script>alert("secret")</script>',appearance:{theme:'dark',motion:'reduced',fontSize:18,language:'en'}});
 assert.match(html,/data-theme="dark"/);assert.match(html,/data-motion="reduced"/);assert.match(html,/--startup-font-size:18px/);
 assert.match(html,/Could not start SecondU/);assert.ok(html.includes(`href="${RETRY_URL}"`));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 assert.ok(html.includes("default-src 'none'"));assert.ok(!html.includes('background-image:'));
});
test('native artwork is loaded from a local document instead of an oversized navigation URL',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-startup-document-'));
 try {
  const document=writeStartupDocument(root,directory,{appearance:{language:'en'}});
  assert.equal(document.file,path.join(directory,'startup.html'));
  assert.ok(document.url.startsWith('file:'));
  assert.ok(document.url.length<1024);
  assert.equal(readFileSync(document.file,'utf8'),startupHtml(root,{appearance:{language:'en'}}));
  assert.ok(readFileSync(document.file,'utf8').includes('Opening your workspace'));
  writeStartupDocument(root,directory,{error:'A local service error'});
  assert.ok(readFileSync(document.file,'utf8').includes('A local service error'));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('initial native window fits laptop and secondary display work areas',()=>{
 for(const workArea of [{x:0,y:25,width:1200,height:898},{x:-1920,y:25,width:1920,height:1055},{x:0,y:25,width:800,height:575}]){
  const b=initialWindowBounds(workArea);
  assert.ok(b.x>=workArea.x+24&&b.y>=workArea.y+24);
  assert.ok(b.x+b.width<=workArea.x+workArea.width-24);
  assert.ok(b.y+b.height<=workArea.y+workArea.height-24);
  assert.ok(b.minWidth<=b.width&&b.minHeight<=b.height);
  assert.ok(b.width<=1440&&b.height<=960);
 }
});
test('native backend handshake requires the same revision, application, version and data space',()=>{
 const expected={application:'hither-desktop',version:'0.1.0',spaceId:'personal-store',revision:'current-build'};
 const healthy={status:'ok',...expected};
 assert.equal(backendIdentityMatches(healthy,expected),true);
 for(const change of [{revision:undefined},{revision:'older-build'},{spaceId:'another-store'},{application:'another-app'},{version:'0.0.9'},{status:'error'}])assert.equal(backendIdentityMatches({...healthy,...change},expected),false);
 assert.equal(backendIdentityMatches({...healthy,revision:undefined},{...expected,revision:undefined}),false);
});
test('an old backend keeps its port while native startup selects a free port',async()=>{
 const expected={application:'hither-desktop',version:'0.1.0',spaceId:'same-store',revision:'new-build'};
 const probed=[];
 const states=new Map([[58645,{occupied:true,value:{status:'ok',...expected,revision:undefined}}],[58646,{occupied:true,value:{status:'ok',...expected,revision:'old-build'}}],[58647,{occupied:false}],[58648,{occupied:true}]]);
 assert.deepEqual(await selectBackendPort([...states.keys()],async port=>{probed.push(port);return states.get(port);},expected),{port:58647,reuse:false});
 assert.deepEqual(probed,[58645,58646,58647,58648]);
 assert.equal(states.get(58645).occupied,true);
 assert.equal(states.get(58646).occupied,true);
 states.set(58648,{occupied:true,value:{status:'ok',...expected}});
 assert.deepEqual(await selectBackendPort([...states.keys()],async port=>states.get(port),expected),{port:58648,reuse:true});
 assert.equal(await selectBackendPort([58645,58646],async port=>states.get(port),expected),undefined);
});
