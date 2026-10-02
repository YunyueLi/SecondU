import {readFile,writeFile,mkdir,lstat,realpath,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** Derive only hash-reviewed public artwork, with one URL shared by site and embed. */
export async function buildWebsiteArtwork({root,output,base,manifestPath=path.join(root,'website/artwork-assets.json')}) {
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const allowed=JSON.parse(await readFile(path.join(root,'website/embed-public-assets.json'),'utf8')).files;
 if(manifest.privateInputs!==false||!Array.isArray(manifest.assets))throw new Error('Invalid public artwork manifest.');
 const publicRoot=await realpath(path.join(root,'public')),inputs=[];
 const seen=new Set();
 for(const item of manifest.assets){
  if(typeof item.source!=='string'||!/^art\/[a-z0-9/-]+\.png$/.test(item.source)||item.source.split('/').includes('..')||!allowed.includes(item.source)||seen.has(item.source))throw new Error('Artwork source is outside the reviewed allowlist.');
  seen.add(item.source);
  const file=path.join(publicRoot,item.source),resolved=await realpath(file);
  if(!(await lstat(file)).isFile()||resolved!==file)throw new Error('Artwork inputs must be regular public files.');
  const bytes=await readFile(file);
  if(hash(bytes)!==item.sourceSha256)throw new Error(`Artwork source hash mismatch: ${item.source}`);
  if(!Array.isArray(item.variants)||!item.variants.some(v=>v.name==='default')||new Set(item.variants.map(v=>v.name)).size!==item.variants.length||item.variants.some(v=>!['default','avatar','thumbnail'].includes(v.name)||!Number.isInteger(v.size)||v.size<128||v.size>1600||!Number.isInteger(v.quality)||v.quality<85||v.quality>95))throw new Error('Invalid artwork derivative settings.');
  inputs.push({...item,bytes,metadata:await sharp(bytes).metadata()});
 }
 const records=[],sources=new Map();
 for(const item of inputs){
  const variants=new Map();
  for(const variant of item.variants){
   const relative=`assets/artwork/${item.source.slice(4,-4)}${variant.name==='default'?'':`-${variant.name}`}.webp`;
   const {data,info}=await sharp(item.bytes).resize({width:variant.size,height:variant.size,fit:'inside',withoutEnlargement:true}).webp({quality:variant.quality,alphaQuality:100,effort:5}).toBuffer({resolveWithObject:true});
   const metadata=await sharp(data).metadata();
   if(item.metadata.hasAlpha&&!metadata.hasAlpha||metadata.exif||metadata.xmp||metadata.iptc)throw new Error(`Artwork transparency or metadata boundary changed: ${item.source}`);
   if(data.length>=item.bytes.length)throw new Error(`Artwork derivative did not reduce transfer size: ${item.source}`);
   await mkdir(path.dirname(path.join(output,relative)),{recursive:true});await writeFile(path.join(output,relative),data);
   variants.set(variant.name,`${base}${relative}`);
   records.push({source:item.source,sourceSha256:item.sourceSha256,sourceBytes:item.bytes.length,sourceWidth:item.metadata.width,sourceHeight:item.metadata.height,variant:variant.name,file:relative,bytes:data.length,sha256:hash(data),width:info.width,height:info.height,alpha:item.metadata.hasAlpha,quality:variant.quality});
  }
  sources.set(item.source,variants);
 }
 await writeFile(path.join(output,'artwork-manifest.json'),JSON.stringify({privateInputs:false,encoder:{name:'sharp',version:sharp.versions.sharp,webp:sharp.versions.webp},assets:records},null,2)+'\n');
 const urlFor=(source,variant='default')=>sources.get(source)?.get(variant)||sources.get(source)?.get('default');
 const aliases=new Map();
 for(const source of sources.keys())for(const prefix of ['/',base,`${base}product/`])aliases.set(`${prefix}${source}`,source);
 for(const source of sources.keys())aliases.set(`${base}assets/${path.basename(source)}`,source);
 function rewriteSource(code,{avatar=false}={}){
  // The component catalogue chooses among these four reviewed atlases at runtime.
  code=code.replace(/\/art\/themes\/(\$\{[A-Za-z_$][\w$]*\})-atlas-v1\.png/g,`${base}assets/artwork/themes/$1-atlas-v1.webp`);
  for(const [original,source] of aliases){
   const target=urlFor(source,avatar&&source==='art/twin-badge-v1.png'?'avatar':'default');
   code=code.replace(new RegExp(`([\x27\x22\x60(])${escape(original)}(?=[\x27\x22\x60)])`,'g'),(_all,quote)=>quote+target);
  }
  // This site expression already contains import.meta.env.BASE_URL.
  for(const name of ['pencil-garden','tidal-pencil','moon-voyage'])code=code.replaceAll(`assets/${name}.png`,`assets/artwork/${name}.webp`);
  return code;
 }
 function rewriteCss(code){
  const replace=(block,variant)=>block.replace(/url\((['"]?)([^)'"\s]+)\1\)/g,(all,quote,url)=>aliases.has(url)?`url(${quote}${urlFor(aliases.get(url),variant)}${quote})`:all);
  code=code.replace(/\.atmosphere-(?:pencil|tidal|night)\s*\{[^}]*\}/g,block=>replace(block,'thumbnail'));
  return replace(code,'default');
 }
 function resolveImport(source,importer){
  if(!importer||!source.endsWith('.png'))return;
  const file=path.resolve(path.dirname(importer.split('?')[0]),source),relative=path.relative(publicRoot,file).split(path.sep).join('/');
  const url=urlFor(relative);return url?`\0secondu-public-artwork:${url}`:undefined;
 }
 return {records,urlFor,rewriteSource,rewriteCss,resolveImport,load:id=>id.startsWith('\0secondu-public-artwork:')?`export default ${JSON.stringify(id.slice('\0secondu-public-artwork:'.length))};`:undefined};
}

/** Fail the build if a rendered reference retains an original PNG or misses its derivative. */
export async function verifyWebsiteArtwork({output,base,records}){
 const original=[...new Set(records.map(row=>row.source))];
 const expected=new Set(records.map(row=>`${base}${row.file}`));
 for(const item of await readdir(output,{recursive:true,withFileTypes:true})){
  if(!item.isFile()||!/\.(?:js|css|html)$/.test(item.name))continue;
  const file=path.join(item.parentPath,item.name),code=await readFile(file,'utf8');
  for(const source of original)for(const alias of [source,`assets/${path.basename(source)}`])if(new RegExp(`[\x27\x22\x60(/]${escape(alias)}`).test(code))throw new Error(`Original artwork remains in rendered output: ${path.relative(output,file)}: ${source}`);
  if(/\/art\/themes\/[^\n]{0,100}-atlas-v1\.png/.test(code))throw new Error(`Original dynamic artwork remains in rendered output: ${path.relative(output,file)}`);
  for(const match of code.matchAll(new RegExp(`${escape(base)}assets/artwork/[a-z0-9/.-]+\\.webp`,'g'))){
   if(!expected.has(match[0])||!(await lstat(path.join(output,match[0].slice(base.length)))).isFile())throw new Error(`Missing website artwork derivative: ${match[0]}`);
  }
 }
}
