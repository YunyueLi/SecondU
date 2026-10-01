import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folders=['docs/diagrams','website/public/architecture'];
const manifests=await Promise.all(folders.map(folder=>readFile(path.join(root,folder,'manifest.json'),'utf8')));
assert.equal(manifests[0],manifests[1],'Public diagram manifests differ');
const manifest=JSON.parse(manifests[0]);
assert.match(manifest.repository.revision,/^[a-f0-9]{40}$/);
let count=0;
for(const item of manifest.artifacts){
 for(const [kind,name] of Object.entries(item.files)){
  assert.equal(path.basename(name),name,'Only local filenames are allowed');
  const copies=await Promise.all(folders.map(folder=>readFile(path.join(root,folder,name))));
  assert.deepEqual(copies[0],copies[1],`Public copies differ: ${name}`);
  assert.equal(createHash('sha256').update(copies[0]).digest('hex'),item.sha256[kind],`Hash mismatch: ${name}`);
  assert.ok(!/\/Users\/|\/var\/folders\/|file:\/\/|\.local\//.test(copies[0].toString()),`Host path in ${name}`);
  if(kind==='specification'){
   const spec=JSON.parse(copies[0]);assert.equal(spec.meta.repository.revision,manifest.repository.revision);
   for(const node of spec.components??spec.nodes){assert.ok(node.sources?.length,`${node.id} has no evidence`);for(const ref of node.sources){assert.ok(!path.isAbsolute(ref.path)&&!ref.path.split('/').includes('..'));assert.ok(ref.line>=1&&ref.end_line>=ref.line);}}
  }
  if(kind.startsWith('svg'))assert.ok(!/<script\b|<foreignObject\b|<image[^>]+(?:href|xlink:href)=["']https?:/i.test(copies[0].toString()),`Noncanonical SVG content: ${name}`);
  count++;
 }
}
for(const filename of ['LICENSE.archify.txt','JetBrainsMono-OFL.txt']){
 const copies=await Promise.all(folders.map(folder=>readFile(path.join(root,folder,filename),'utf8')));assert.equal(copies[0],copies[1]);assert.ok(copies[0].length>100);
}
for(const folder of folders)assert.ok((await readdir(path.join(root,folder))).every(name=>!/(?:delivery|finalize|browser-check|visual-check)/.test(name)),`Private receipt in ${folder}`);
console.log(JSON.stringify({status:'passed',diagrams:manifest.artifacts.length,publicArtifacts:count,mirrors:'identical',licenseFiles:2,sourceRevision:manifest.repository.revision}));
