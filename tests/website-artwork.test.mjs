import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,cp,rm,readdir,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
let buildWebsiteArtwork,verifyWebsiteArtwork;
try{({buildWebsiteArtwork,verifyWebsiteArtwork}=await import('../website/build-artwork.mjs'));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const options={skip:!buildWebsiteArtwork&&'Install website build dependencies to verify WebP encoding.'};
test('website artwork preserves reviewed sources and transparency, emits small shared URLs and retina thumbnails',options,async t=>{
 const output=await mkdtemp(path.join(os.tmpdir(),'secondu-artwork-'));t.after(()=>rm(output,{recursive:true,force:true}));
 const assets=JSON.parse(await readFile(path.join(root,'website/artwork-assets.json'))).assets;
 const before=await Promise.all(assets.map(item=>readFile(path.join(root,'public',item.source))));
 const result=await buildWebsiteArtwork({root,output,base:'/SecondU/'});
 assert.equal(result.records.length,13);
 for(const row of result.records){const bytes=await readFile(path.join(output,row.file));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.ok(row.bytes<row.sourceBytes*.4);assert.ok(row.width<=row.sourceWidth&&row.height<=row.sourceHeight);}
 for(let i=0;i<assets.length;i++)assert.deepEqual(await readFile(path.join(root,'public',assets[i].source)),before[i]);
 const avatar=result.records.find(row=>row.variant==='avatar');assert.equal(avatar.alpha,true);assert.ok(avatar.bytes<15000);assert.ok(avatar.width>=128);
 assert.equal(result.urlFor('art/pencil-garden.png'),'/SecondU/assets/artwork/pencil-garden.webp');
 assert.equal(result.rewriteSource("const a='/art/twin-badge-v1.png';",{avatar:true}),"const a='/SecondU/assets/artwork/twin-badge-v1-avatar.webp';");
 assert.match(result.rewriteSource('`url(${import.meta.env.BASE_URL}assets/pencil-garden.png)`'),/assets\/artwork\/pencil-garden.webp/);
 assert.equal(result.rewriteSource("`url('/art/themes/${theme}-atlas-v1.png')`"),"`url('/SecondU/assets/artwork/themes/${theme}-atlas-v1.webp')`");
 assert.equal(result.rewriteSource("import img from '../../public/art/twin-badge-v1.png';"),"import img from '../../public/art/twin-badge-v1.png';");
 const css=result.rewriteCss(".atmosphere-pencil {background:url('/art/pencil-garden.png')}.welcome-artwork{background:url('/SecondU/product/art/pencil-garden.png')}");
 assert.match(css,/pencil-garden-thumbnail.webp/);assert.match(css,/pencil-garden.webp/);assert.ok(!css.includes('.png'));
 assert.equal(result.resolveImport('../../public/art/twin-badge-v1.png',path.join(root,'website/src/Hero.tsx')),'\0secondu-public-artwork:/SecondU/assets/artwork/twin-badge-v1.webp');
 const rendered=path.join(output,'index.html');
 await writeFile(rendered,'<img src="/SecondU/assets/artwork/twin-badge-v1-avatar.webp">');
 await verifyWebsiteArtwork({output,base:'/SecondU/',records:result.records});
 await writeFile(rendered,'<img src="/SecondU/product/art/twin-badge-v1.png">');
 await assert.rejects(verifyWebsiteArtwork({output,base:'/SecondU/',records:result.records}),/Original artwork/);
 await writeFile(rendered,'<img src="/SecondU/assets/artwork/unreviewed.webp">');
 await assert.rejects(verifyWebsiteArtwork({output,base:'/SecondU/',records:result.records}),/Missing website artwork/);
});
test('website artwork rejects changed sources and symlink substitutions before any publication',options,async t=>{
 const fixture=await mkdtemp(path.join(os.tmpdir(),'secondu-artwork-boundary-'));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await mkdir(path.join(fixture,'website'),{recursive:true});await mkdir(path.join(fixture,'public/art'),{recursive:true});
 const original=JSON.parse(await readFile(path.join(root,'website/artwork-assets.json')));original.assets=original.assets.slice(0,1);
 await writeFile(path.join(fixture,'website/artwork-assets.json'),JSON.stringify(original));await cp(path.join(root,'website/embed-public-assets.json'),path.join(fixture,'website/embed-public-assets.json'));
 const source=path.join(fixture,'public',original.assets[0].source),output=path.join(fixture,'output');
 await writeFile(source,'unreviewed input');await assert.rejects(buildWebsiteArtwork({root:fixture,output,base:'/'}),/hash mismatch/);await assert.rejects(readdir(output),{code:'ENOENT'});
 await rm(source);await symlink(path.join(root,'public',original.assets[0].source),source);await assert.rejects(buildWebsiteArtwork({root:fixture,output,base:'/'}),/regular public files/);await assert.rejects(readdir(output),{code:'ENOENT'});
});
