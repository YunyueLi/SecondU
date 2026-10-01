import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const diagramIds=['harness-zh','harness-en','understanding-loop-zh','understanding-loop-en'];
const kinds={html:'.html',svg:'.svg',specification:'.json',svgLight:'-light.svg',svgDark:'-dark.svg'};
const licenses=['LICENSE.archify.txt','JetBrainsMono-OFL.txt'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

// Keep the same explicit public boundary as the product's artwork allowlist.
// Neither unlisted files nor generation receipts are eligible for publication.
export async function copyArchitectureAssets({sourceDirectory,outputDirectory}){
  const directory=await lstat(sourceDirectory);
  if(!directory.isDirectory()||directory.isSymbolicLink())throw new Error('Architecture assets must be a regular directory.');
  const read=async name=>{
    if(path.basename(name)!==name)throw new Error('Invalid architecture asset name.');
    const file=path.join(sourceDirectory,name),info=await lstat(file);
    if(!info.isFile()||info.isSymbolicLink())throw new Error(`Architecture asset must be a regular file: ${name}`);
    return readFile(file);
  };
  const manifestBytes=await read('manifest.json'),manifest=JSON.parse(manifestBytes);
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.artifacts)||manifest.artifacts.length!==diagramIds.length)throw new Error('Invalid architecture manifest.');
  const selected=new Map([['manifest.json',manifestBytes]]),seen=new Set();
  for(const artifact of manifest.artifacts){
    if(!diagramIds.includes(artifact.id)||seen.has(artifact.id))throw new Error('Unknown or duplicate architecture diagram.');
    seen.add(artifact.id);
    if(Object.keys(artifact.files??{}).sort().join(',')!==Object.keys(kinds).sort().join(','))throw new Error('Invalid architecture formats.');
    for(const [kind,extension] of Object.entries(kinds)){
      const name=`${artifact.id}${extension}`;
      if(artifact.files[kind]!==name)throw new Error('Architecture filename does not match its diagram.');
      const bytes=await read(name);
      if(digest(bytes)!==artifact.sha256?.[kind])throw new Error(`Architecture hash mismatch: ${name}`);
      if(/\/Users\/|\/var\/folders\/|file:\/\/|\.local\//.test(bytes.toString()))throw new Error(`Host path found in architecture asset: ${name}`);
      selected.set(name,bytes);
    }
  }
  for(const name of licenses)selected.set(name,await read(name));
  const destination=path.join(outputDirectory,'architecture');
  await mkdir(destination,{recursive:true});
  for(const [name,bytes] of selected)await writeFile(path.join(destination,name),bytes);
  return [...selected.keys()];
}
