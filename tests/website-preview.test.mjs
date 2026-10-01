import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {createPublicPreviewMiddleware,embeddedBuildBase} from '../website/preview-assets.mjs';

test('preview serves a deployment-prefixed embed at a root Vite URL without an HTML module fallback',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'secondu-preview-test-'));
 const write=(file,text)=>{mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);};
 write('website/site.json',JSON.stringify({base:'/SecondU/'}));
 write('dist-site/product/embed.html','<script type="module" src="/SecondU/product/assets/runtime.js"></script>');
 write('dist-site/product/assets/runtime.js','export const example = true;');
 write('dist-site/benchmark/2026-10-01-v2/inputs.json','{"synthetic":true}');
 write('private.json','private fixture');
 symlinkSync(path.join(root,'private.json'),path.join(root,'dist-site/product/assets/link.json'));
 const middleware=createPublicPreviewMiddleware(root),server=createServer((request,response)=>{middleware(request,response,()=>{response.setHeader('Content-Type','text/html');response.end('Vite page fallback');}).catch(error=>{response.statusCode=500;response.end(error.message);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  const document=await fetch(`${origin}/product/embed.html`);assert.equal(document.status,200);assert.match(await document.text(),/\/SecondU\/product\/assets/);
  for(const requestPath of ['/product/assets/runtime.js','/SecondU/product/assets/runtime.js']){
   const response=await fetch(origin+requestPath);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/javascript/);assert.equal(await response.text(),'export const example = true;');
  }
  const head=await fetch(`${origin}/SecondU/product/assets/runtime.js`,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  for(const suffix of ['missing.js','link.json','%2e%2e%2f%2e%2e/private.json']){
   const response=await fetch(`${origin}/SecondU/product/assets/${suffix}`);assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/Vite page fallback|private fixture/);
  }
  const benchmark=await fetch(`${origin}/SecondU/benchmark/2026-10-01-v2/inputs.json`);assert.equal(benchmark.status,200);assert.deepEqual(await benchmark.json(),{synthetic:true});
  const page=await fetch(`${origin}/benchmark/`);assert.equal(await page.text(),'Vite page fallback');
  const unlisted=await fetch(`${origin}/benchmark/2026-10-01-v2/private.json`);assert.equal(await unlisted.text(),'Vite page fallback');
  write('dist-site/product/embed.html','<script type="module" src="/other/site/product/assets/runtime.js"></script>');
  const changed=await fetch(`${origin}/other/site/product/assets/runtime.js`);assert.equal(changed.status,200);assert.match(changed.headers.get('content-type'),/^text\/javascript/);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true});}
});

test('preview derives only a safe build prefix and preserves a root build',()=>{
 assert.equal(embeddedBuildBase('<script src="/product/assets/index.js"></script>','/SecondU/'),'/');
 assert.equal(embeddedBuildBase('<script src="https://other.invalid/product/assets/index.js"></script>','/SecondU/'),'/SecondU/');
 assert.equal(embeddedBuildBase('','/../private/'),'/');
});
