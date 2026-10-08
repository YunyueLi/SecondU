import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,cp,rm,readdir,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..');
let buildWebsiteArtwork,verifyWebsiteArtwork;
try{({buildWebsiteArtwork,verifyWebsiteArtwork}=await import('../website/build-artwork.mjs'));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const sharp=buildWebsiteArtwork?createRequire(new URL('../website/package.json',import.meta.url))('sharp'):undefined;
const options={skip:!buildWebsiteArtwork&&'Install website build dependencies to verify WebP encoding.'};
const inputFile=item=>path.join(root,item.namespace==='website'?'website/public':'public',item.source);
test('website artwork preserves reviewed sources and transparency, emits small shared URLs and retina thumbnails',options,async t=>{
 const output=await mkdtemp(path.join(os.tmpdir(),'secondu-artwork-'));t.after(()=>rm(output,{recursive:true,force:true}));
 const assets=JSON.parse(await readFile(path.join(root,'website/artwork-assets.json'))).assets;
 const before=await Promise.all(assets.map(item=>readFile(inputFile(item))));
 const result=await buildWebsiteArtwork({root,output,base:'/SecondU/'});
 assert.equal(result.records.length,19);
 for(const row of result.records){
  const bytes=await readFile(path.join(output,row.file)),metadata=await sharp(bytes).metadata();
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.ok(row.bytes<row.sourceBytes*.4);assert.ok(row.width<=row.sourceWidth&&row.height<=row.sourceHeight);
  assert.equal(metadata.hasAlpha,row.sourceAlpha);assert.equal(row.alpha,metadata.hasAlpha);assert.ok(!metadata.exif&&!metadata.xmp&&!metadata.iptc);
  if(row.namespace==='website'){
   assert.equal(Math.max(row.width,row.height),768);assert.equal(row.quality,92);
   const source=before[assets.findIndex(item=>item.namespace===row.namespace&&item.source===row.source)];
   assert.equal(createHash('sha256').update(source).digest('hex'),row.sourceSha256);
   const originalAlpha=await sharp(source).resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).extractChannel('alpha').raw().toBuffer();
   const derivedAlpha=await sharp(bytes).extractChannel('alpha').raw().toBuffer();
   assert.deepEqual(derivedAlpha,originalAlpha,`${row.source} keeps its resized transparency exactly`);
  }
 }
 for(let i=0;i<assets.length;i++)assert.deepEqual(await readFile(inputFile(assets[i])),before[i]);
 const avatar=result.records.find(row=>row.variant==='avatar');assert.equal(avatar.alpha,true);assert.ok(avatar.bytes<15000);assert.ok(avatar.width>=128);
 assert.equal(result.urlFor('art/pencil-garden.png'),'/SecondU/assets/artwork/pencil-garden.webp');
 assert.equal(result.rewriteSource("const a='/art/twin-badge-v1.png';",{avatar:true}),"const a='/SecondU/assets/artwork/twin-badge-v1-avatar.webp';");
 assert.match(result.rewriteSource('`url(${import.meta.env.BASE_URL}assets/pencil-garden.png)`'),/assets\/artwork\/pencil-garden.webp/);
 assert.equal(result.rewriteSource("`url('/art/themes/${theme}-atlas-v1.png')`"),"`url('/SecondU/assets/artwork/themes/${theme}-atlas-v1.webp')`");
 assert.equal(result.rewriteSource("import img from '../../public/art/twin-badge-v1.png';"),"import img from '../../public/art/twin-badge-v1.png';");
 const css=result.rewriteCss(".atmosphere-pencil {background:url('/art/pencil-garden.png')}.welcome-artwork{background:url('/SecondU/product/art/pencil-garden.png')}");
 assert.match(css,/pencil-garden-thumbnail.webp/);assert.match(css,/pencil-garden.webp/);assert.ok(!css.includes('.png'));
 assert.equal(result.resolveImport('../../public/art/twin-badge-v1.png',path.join(root,'website/src/Hero.tsx')),'\0secondu-public-artwork:/SecondU/assets/artwork/twin-badge-v1.webp');
 for(const item of assets.filter(item=>item.namespace==='website')){
  const expected=`/SecondU/assets/artwork/website/${item.source.slice(0,-4)}.webp`;
  assert.equal(result.urlFor(item.source),undefined,'website-only artwork is not in the shared namespace');
  assert.equal(result.urlFor(item.source,'default','website'),expected);
  assert.equal(result.rewriteSource(`import img from '../public/${item.source}';`),`import img from '../public/${item.source}';`);
  assert.equal(result.resolveImport(`../public/${item.source}`,path.join(root,'website/src/RoadmapEmblem.tsx')),`\0secondu-public-artwork:${expected}`);
  assert.equal(result.resolveImport(`../../public/${item.source}`,path.join(root,'website/src/RoadmapEmblem.tsx')),undefined);
 }
 const rendered=path.join(output,'index.html');
 await writeFile(rendered,'<img src="/SecondU/assets/artwork/twin-badge-v1-avatar.webp">');
 await verifyWebsiteArtwork({output,base:'/SecondU/',records:result.records});
 await writeFile(rendered,'<img src="/SecondU/product/art/twin-badge-v1.png">');
 await assert.rejects(verifyWebsiteArtwork({output,base:'/SecondU/',records:result.records}),/Original artwork/);
 await writeFile(rendered,'<img src="/SecondU/assets/understanding-v1-CNkBYTnk.png">');
 await assert.rejects(verifyWebsiteArtwork({output,base:'/SecondU/',records:result.records}),/Original bundled artwork/);
 await writeFile(rendered,'<img src="/SecondU/assets/artwork/unreviewed.webp">');
 await assert.rejects(verifyWebsiteArtwork({output,base:'/SecondU/',records:result.records}),/Missing website artwork/);
});
test('website artwork keeps equal source names separate and rejects website-only boundary violations',options,async t=>{
 const fixture=await mkdtemp(path.join(os.tmpdir(),'secondu-artwork-namespaces-'));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await mkdir(path.join(fixture,'website/public/art'),{recursive:true});await mkdir(path.join(fixture,'public/art'),{recursive:true});
 const shared=JSON.parse(await readFile(path.join(root,'website/artwork-assets.json'))).assets[0];
 const siteBytes=await readFile(path.join(root,'website/public/assets/privacy-boundaries.png'));
 const site={namespace:'website',source:shared.source,sourceSha256:createHash('sha256').update(siteBytes).digest('hex'),variants:[{name:'default',size:768,quality:92}]};
 const source=path.join(fixture,'website/public',site.source),output=path.join(fixture,'output'),manifestFile=path.join(fixture,'website/artwork-assets.json');
 await cp(inputFile(shared),path.join(fixture,'public',shared.source));await writeFile(source,siteBytes);
 await writeFile(path.join(fixture,'website/embed-public-assets.json'),JSON.stringify({files:[shared.source]}));
 await writeFile(path.join(fixture,'website/artwork-site-assets.json'),JSON.stringify({privateInputs:false,files:[site.source]}));
 await writeFile(manifestFile,JSON.stringify({privateInputs:false,assets:[shared,site]}));
 const result=await buildWebsiteArtwork({root:fixture,output,base:'/'});
 assert.equal(result.urlFor(shared.source),'/assets/artwork/twin-badge-v1.webp');
 assert.equal(result.urlFor(site.source,'default','website'),'/assets/artwork/website/art/twin-badge-v1.webp');
 assert.notEqual(result.records[0].sha256,result.records[2].sha256);
 assert.equal(result.resolveImport('../public/art/twin-badge-v1.png',path.join(fixture,'website/src/Example.tsx')),'\0secondu-public-artwork:/assets/artwork/website/art/twin-badge-v1.webp');
 assert.equal(result.resolveImport('../../public/art/twin-badge-v1.png',path.join(fixture,'website/src/Example.tsx')),'\0secondu-public-artwork:/assets/artwork/twin-badge-v1.webp');
 await rm(output,{recursive:true});
 await writeFile(source,'changed website artwork');
 await assert.rejects(buildWebsiteArtwork({root:fixture,output,base:'/'}),/hash mismatch/);await assert.rejects(readdir(output),{code:'ENOENT'});
 await rm(source);await symlink(path.join(root,'website/public/assets/privacy-boundaries.png'),source);
 await assert.rejects(buildWebsiteArtwork({root:fixture,output,base:'/'}),/regular public files/);await assert.rejects(readdir(output),{code:'ENOENT'});
 await rm(source);await writeFile(source,siteBytes);
 await writeFile(manifestFile,JSON.stringify({privateInputs:false,assets:[{...site,namespace:'unreviewed'}]}));
 await assert.rejects(buildWebsiteArtwork({root:fixture,output,base:'/'}),/reviewed allowlist/);await assert.rejects(readdir(output),{code:'ENOENT'});
 await writeFile(manifestFile,JSON.stringify({privateInputs:false,assets:[site]}));
 await writeFile(path.join(fixture,'website/artwork-site-assets.json'),JSON.stringify({privateInputs:false,files:[]}));
 await assert.rejects(buildWebsiteArtwork({root:fixture,output,base:'/'}),/reviewed allowlist/);await assert.rejects(readdir(output),{code:'ENOENT'});
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
