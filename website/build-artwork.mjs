import {readFile,writeFile,mkdir,lstat,realpath,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

const sourceKey=(namespace,source)=>`${namespace}:${source}`;

/** Derive only hash-reviewed public artwork. Website-only inputs have their own
 * allowlist and URL namespace; they never become desktop/embed public assets. */
export async function buildWebsiteArtwork({root,output,base,manifestPath=path.join(root,'website/artwork-assets.json')}) {
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.privateInputs!==false||!Array.isArray(manifest.assets))throw new Error('Invalid public artwork manifest.');
 const inputs=[],roots=new Map(),allowlists=new Map(),importSources=new Map();
 const seen=new Set();
 for(const item of manifest.assets){
  const namespace=item.namespace??'shared',key=sourceKey(namespace,item.source);
  if(!['shared','website'].includes(namespace)||typeof item.source!=='string'||!/^(?:art|assets)\/[a-z0-9/-]+\.png$/.test(item.source)||item.source.split('/').includes('..')||seen.has(key))throw new Error('Artwork source is outside the reviewed allowlist.');
  if(!allowlists.has(namespace)){
   const allowlist=JSON.parse(await readFile(path.join(root,namespace==='website'?'website/artwork-site-assets.json':'website/embed-public-assets.json'),'utf8'));
   if(!Array.isArray(allowlist.files)||namespace==='website'&&allowlist.privateInputs!==false)throw new Error('Invalid public artwork allowlist.');
   allowlists.set(namespace,allowlist.files);
   roots.set(namespace,await realpath(path.join(root,namespace==='website'?'website/public':'public')));
  }
  if(!allowlists.get(namespace).includes(item.source))throw new Error('Artwork source is outside the reviewed allowlist.');
  seen.add(key);
  const file=path.join(roots.get(namespace),item.source),resolved=await realpath(file);
  if(!(await lstat(file)).isFile()||resolved!==file)throw new Error('Artwork inputs must be regular public files.');
  const bytes=await readFile(file);
  if(hash(bytes)!==item.sourceSha256)throw new Error(`Artwork source hash mismatch: ${key}`);
  if(!Array.isArray(item.variants)||!item.variants.some(v=>v.name==='default')||new Set(item.variants.map(v=>v.name)).size!==item.variants.length||item.variants.some(v=>!['default','avatar','thumbnail'].includes(v.name)||!Number.isInteger(v.size)||v.size<128||v.size>1600||!Number.isInteger(v.quality)||v.quality<85||v.quality>95))throw new Error('Invalid artwork derivative settings.');
  inputs.push({...item,namespace,key,bytes,metadata:await sharp(bytes).metadata()});
  importSources.set(file,key);
  importSources.set(path.resolve(root,namespace==='website'?'website/public':'public',item.source),key);
 }
 const records=[],sources=new Map();
 for(const item of inputs){
  const variants=new Map();
  for(const variant of item.variants){
   const stem=item.namespace==='website'?`website/${item.source.slice(0,-4)}`:item.source.slice(4,-4);
   const relative=`assets/artwork/${stem}${variant.name==='default'?'':`-${variant.name}`}.webp`;
   const {data,info}=await sharp(item.bytes).resize({width:variant.size,height:variant.size,fit:'inside',withoutEnlargement:true}).webp({quality:variant.quality,alphaQuality:100,effort:5}).toBuffer({resolveWithObject:true});
   const metadata=await sharp(data).metadata();
   if(item.metadata.hasAlpha&&!metadata.hasAlpha||metadata.exif||metadata.xmp||metadata.iptc)throw new Error(`Artwork transparency or metadata boundary changed: ${item.source}`);
   if(data.length>=item.bytes.length)throw new Error(`Artwork derivative did not reduce transfer size: ${item.source}`);
   await mkdir(path.dirname(path.join(output,relative)),{recursive:true});await writeFile(path.join(output,relative),data);
   variants.set(variant.name,`${base}${relative}`);
   records.push({namespace:item.namespace,source:item.source,sourceSha256:item.sourceSha256,sourceBytes:item.bytes.length,sourceWidth:item.metadata.width,sourceHeight:item.metadata.height,sourceAlpha:item.metadata.hasAlpha,variant:variant.name,file:relative,bytes:data.length,sha256:hash(data),width:info.width,height:info.height,alpha:metadata.hasAlpha,quality:variant.quality});
  }
  sources.set(item.key,variants);
 }
 await writeFile(path.join(output,'artwork-manifest.json'),JSON.stringify({privateInputs:false,encoder:{name:'sharp',version:sharp.versions.sharp,webp:sharp.versions.webp},assets:records},null,2)+'\n');
 const urlFor=(source,variant='default',namespace='shared')=>sources.get(sourceKey(namespace,source))?.get(variant)||sources.get(sourceKey(namespace,source))?.get('default');
 const aliases=new Map();
 // Plain /art URLs belong to the shared public directory. Website-only assets
 // are resolved by their imported file path so an equal filename cannot collide.
 for(const {source,namespace} of inputs)if(namespace==='shared'){
  for(const prefix of ['/',base,`${base}product/`])aliases.set(`${prefix}${source}`,source);
  aliases.set(`${base}assets/${path.basename(source)}`,source);
 }
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
  const file=path.resolve(path.dirname(importer.split('?')[0]),source);
  const url=sources.get(importSources.get(file))?.get('default');
  if(url)return `\0secondu-public-artwork:${url}`;
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
  for(const source of original)if(new RegExp(`[\x27\x22\x60(/]assets/${escape(path.basename(source,'.png'))}-[A-Za-z0-9_-]+\\.png`).test(code))throw new Error(`Original bundled artwork remains in rendered output: ${path.relative(output,file)}: ${source}`);
  if(/\/art\/themes\/[^\n]{0,100}-atlas-v1\.png/.test(code))throw new Error(`Original dynamic artwork remains in rendered output: ${path.relative(output,file)}`);
  for(const match of code.matchAll(new RegExp(`${escape(base)}assets/artwork/[a-z0-9/.-]+\\.webp`,'g'))){
   if(!expected.has(match[0])||!(await lstat(path.join(output,match[0].slice(base.length)))).isFile())throw new Error(`Missing website artwork derivative: ${match[0]}`);
  }
 }
}
