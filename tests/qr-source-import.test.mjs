import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';
import {parseAgentImport,decodeAgentQR} from '../src/agents/qrImport.ts';
import {encodeCard,decodeCard} from '../src/cognition/qr.ts';
import {normalizeAgentSourceUrl} from '../shared/agent-source.mjs';
import {createApp} from '../server/index.mjs';

// Render an actual QR matrix into image pixels, then exercise the same decoder as the image UI.
function qrImage(text){
 const modules=QRCode.create(text,{errorCorrectionLevel:'M'}).modules;
 const scale=6,margin=4,width=(modules.size+margin*2)*scale;
 const pixels=new Uint8ClampedArray(width*width*4).fill(255);
 for(let row=0;row<modules.size;row++)for(let col=0;col<modules.size;col++)if(modules.get(row,col)){
  for(let y=0;y<scale;y++)for(let x=0;x<scale;x++){
   const offset=(((row+margin)*scale+y)*width+(col+margin)*scale+x)*4;
   pixels[offset]=pixels[offset+1]=pixels[offset+2]=0;
  }
 }
 return {pixels,width};
}
function fromQR(text){const image=qrImage(text);return decodeAgentQR(image.pixels,image.width,image.width);}
const source='https://example.com/garden/care?plant=fern&place=home#water';
const card={name:'植物养护助理',role:'整理我提供的养护信息',instructions:'根据我提供的品种和环境整理建议，缺少信息先问我。',sourceUrl:source};

test('a real ordinary QR enters a source preview without inventing an agent or reading the website',()=>{
 const oldFetch=globalThis.fetch;let networkCalls=0;globalThis.fetch=()=>{networkCalls++;throw new Error('Unexpected network request');};
 try{
  const result=fromQR(source);
  assert.equal(result.text,source);
  assert.deepEqual(result.preview,{kind:'source',hostname:'example.com',sourceUrl:source});
  assert.deepEqual(parseAgentImport(`  ${source}  `),result.preview);
  assert.equal('name' in result.preview,false);assert.equal('instructions' in result.preview,false);
  assert.equal(networkCalls,0);
 }finally{globalThis.fetch=oldFetch;}
});

test('a real shared-agent QR preserves source provenance and imports only public card fields',()=>{
 const encoded=encodeCard({...card,connectionId:'private-model',apiKey:'must-not-import',permissions:['computer'],contextFactIds:['private-fact']});
 assert.deepEqual(fromQR(encoded).preview,{kind:'card',card});
 assert.deepEqual(decodeCard(encodeCard(card)),card);
 assert.deepEqual(parseAgentImport(JSON.stringify(card)),{kind:'card',card});
});

test('source parsing normalizes the visible host and rejects executable or credential-bearing URLs',()=>{
 assert.deepEqual(parseAgentImport('https://例子.测试/地点'),{kind:'source',hostname:'xn--fsqu00a.xn--0zwm56d',sourceUrl:'https://xn--fsqu00a.xn--0zwm56d/%E5%9C%B0%E7%82%B9'});
 assert.equal(normalizeAgentSourceUrl('HTTP://Example.COM/care'),'http://example.com/care');
 const rejected=['javascript:alert(1)','data:text/html,hello','file:///tmp/card','//example.com','https:example.com','https://','https://user:password@example.com','https://user@example.com','https://user%40name:pass@example.com','https://example.com\\@other.example','https://exa\nmple.com','https://example.com/a b','https://example.com/'+ 'a'.repeat(2000)];
 for(const value of rejected){assert.throws(()=>parseAgentImport(value),undefined,value);assert.throws(()=>normalizeAgentSourceUrl(value),undefined,value);}
 for(const sourceUrl of [null,42,'javascript:alert(1)','https://user:password@example.com'])assert.throws(()=>decodeCard(encodeCard({...card,sourceUrl})),undefined,String(sourceUrl));
 assert.throws(()=>fromQR('https://user:password@example.com'),/用户名或密码/);
 assert.throws(()=>fromQR('javascript:alert(1)'),/HTTP/);
});

test('an image without a QR gives a real decoding error',()=>{
 assert.throws(()=>decodeAgentQR(new Uint8ClampedArray(160*160*4).fill(255),160,160),/二维码/);
});

test('a reviewed source creates only the authored agent; API also rejects unsafe URLs without mutation',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'hither-qr-source-'));
 const app=createApp({dataDir:dir,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const request=async(body,id)=>{
  const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/agents${id?`/${id}`:''}`,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const preview=fromQR(source).preview;
 assert.equal(preview.kind,'source');
 const beforeConnections=app.store.list('modelConnections');
 const result=await request({...card,sourceUrl:preview.sourceUrl});
 assert.equal(result.status,201);
 const saved=app.store.require('agents',result.body.id);
 assert.equal(saved.sourceUrl,source);assert.equal(saved.name,card.name);assert.equal(saved.instructions,card.instructions);assert.equal(saved.connectionId,undefined);
 assert.deepEqual(decodeCard(encodeCard({name:saved.name,role:saved.role,instructions:saved.instructions,sourceUrl:saved.sourceUrl})),card);
 assert.equal(app.store.list('tasks').length,0);assert.equal(app.store.list('agentRooms').length,0);assert.deepEqual(app.store.list('modelConnections'),beforeConnections);
 for(const bad of ['javascript:alert(1)','https://user:password@example.com','https://exa\nmple.com','https://example.com\\@evil.example']){
  assert.equal((await request({...card,sourceUrl:bad})).status,400);
  assert.equal((await request({sourceUrl:bad},saved.id)).status,400);
 }
 assert.equal(app.store.list('agents').length,1);assert.deepEqual(app.store.require('agents',saved.id),saved);
});
