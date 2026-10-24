import {cp,lstat,mkdir,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';

export const twinMcpRuntimePackages=Object.freeze(['@modelcontextprotocol/server','@modelcontextprotocol/core','zod']);
// Reviewed server dependencies and their complete production closure. Electron
// supplies its own module; browser dependencies are already bundled by Vite.
export const desktopRuntimePackages=Object.freeze([
  ...twinMcpRuntimePackages,
  'fast-xml-parser','@nodable/entities','fast-xml-builder','is-unsafe',
  'path-expression-matcher','strnum','xml-naming','anynum',
]);
const dependencyEntries=value=>JSON.stringify(Object.entries(value??{}).sort(([a],[b])=>a.localeCompare(b)));

async function copyReviewedRuntime(projectRoot,packagedRoot,names){
  const lock=JSON.parse(await readFile(path.join(projectRoot,'package-lock.json'),'utf8'));
  const packages=[];
  for(const name of names){
    const relative=`node_modules/${name}`,source=path.join(projectRoot,relative),record=lock.packages?.[relative];
    if(!(await lstat(source)).isDirectory())throw new Error(`Runtime package must be an installed directory: ${name}`);
    const manifest=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
    if(!record||record.dev||record.link||manifest.name!==name||manifest.version!==record.version)throw new Error(`Runtime does not match the production dependency lock: ${name}`);
    for(const field of ['dependencies','optionalDependencies','peerDependencies']){
      if(dependencyEntries(manifest[field])!==dependencyEntries(record[field]))throw new Error(`Runtime dependency metadata differs from the lock: ${name}`);
      if(Object.keys(manifest[field]??{}).some(dependency=>!names.includes(dependency)))throw new Error(`Runtime gained an unreviewed dependency: ${name}`);
    }
    // This reviewed graph is flat. A newly nested installation must be reviewed
    // explicitly, rather than copied with extra or conflicting package versions.
    try{if((await readdir(path.join(source,'node_modules'))).length)throw new Error(`Runtime gained a nested dependency installation: ${name}`);}
    catch(error){if(error.code!=='ENOENT')throw error;}
    packages.push({relative,source});
  }
  // Validate the whole graph before writing any part of the package.
  for(const {relative,source} of packages){
    await mkdir(path.dirname(path.join(packagedRoot,relative)),{recursive:true});
    await cp(source,path.join(packagedRoot,relative),{recursive:true,verbatimSymlinks:true,filter:file=>path.basename(file)!=='.DS_Store'});
  }
}

/** Copy the standalone, pure-JS stdio server runtime, never client/dev packages. */
export async function copyTwinMcpRuntime(projectRoot,packagedRoot){
  return copyReviewedRuntime(projectRoot,packagedRoot,twinMcpRuntimePackages);
}

/** Copy only the locked production modules used by the packaged local service. */
export async function copyDesktopRuntime(projectRoot,packagedRoot){
  return copyReviewedRuntime(projectRoot,packagedRoot,desktopRuntimePackages);
}
