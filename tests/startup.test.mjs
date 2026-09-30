import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url);
const {startupHtml,writeStartupDocument,readStartupAppearance,RETRY_URL}=require('../desktop/startup.cjs');
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
