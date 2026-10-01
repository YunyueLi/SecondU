import {cp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';

/** Copy the pinned, pure-JS stdio server runtime, never client/dev packages. */
export async function copyTwinMcpRuntime(projectRoot,packagedRoot){
  const names=['@modelcontextprotocol/server','@modelcontextprotocol/core','zod'];
  const lock=JSON.parse(await readFile(path.join(projectRoot,'package-lock.json'),'utf8'));
  for(const name of names){
    const relative=`node_modules/${name}`,source=path.join(projectRoot,relative),manifest=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
    if(manifest.version!==lock.packages[relative]?.version)throw new Error('MCP runtime does not match the dependency lock.');
    if(Object.keys(manifest.dependencies??{}).some(dependency=>!names.includes(dependency)))throw new Error('MCP runtime gained an unreviewed dependency.');
    await mkdir(path.dirname(path.join(packagedRoot,relative)),{recursive:true});await cp(source,path.join(packagedRoot,relative),{recursive:true,verbatimSymlinks:true});
  }
}
