import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {copyArchitectureAssets} from '../website/build-diagrams.mjs';
import {copyRoadmapProvenance} from '../website/build-roadmap.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'secondu-public-diagrams-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),output=path.join(root,'output');
 await cp(new URL('../website/public/architecture/',import.meta.url),source,{recursive:true});
 return {source,output};
}
test('website publishes only manifest-bound architecture files and required licenses',async t=>{
 const {source,output}=await fixture(t);
 await writeFile(path.join(source,'unlisted-private.txt'),'not eligible');
 await writeFile(path.join(source,'old.finalize.json'),'local receipt');
 const files=await copyArchitectureAssets({sourceDirectory:source,outputDirectory:output});
 assert.equal(files.length,23);
 assert.deepEqual((await readdir(path.join(output,'architecture'))).sort(),files.sort());
 for(const name of files)assert.deepEqual(await readFile(path.join(output,'architecture',name)),await readFile(path.join(source,name)));
});
test('architecture publication rejects tampered bytes and path substitutions before copying',async t=>{
 const {source,output}=await fixture(t);
 const filename=path.join(source,'harness-en.html'),original=await readFile(filename);
 await writeFile(filename,'tampered');
 await assert.rejects(copyArchitectureAssets({sourceDirectory:source,outputDirectory:output}),/hash mismatch/);
 await assert.rejects(readdir(output),{code:'ENOENT'});
 await writeFile(filename,original);
 const manifestFile=path.join(source,'manifest.json'),manifest=JSON.parse(await readFile(manifestFile));
 manifest.artifacts[0].files.html='../private.html';await writeFile(manifestFile,JSON.stringify(manifest));
 await assert.rejects(copyArchitectureAssets({sourceDirectory:source,outputDirectory:output}),/filename does not match/);
});
test('a symlink cannot make a local receipt or private file eligible for publication',async t=>{
 const {source,output}=await fixture(t),filename=path.join(source,'harness-en.html');
 const bytes=await readFile(filename),target=path.join(path.dirname(source),'outside.html');
 await writeFile(target,bytes);await rm(filename);await symlink(target,filename);
 await assert.rejects(copyArchitectureAssets({sourceDirectory:source,outputDirectory:output}),/regular file/);
 await assert.rejects(readdir(output),{code:'ENOENT'});
});
test('roadmap provenance includes only hash-matched public prompts and its manifest',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'secondu-public-roadmap-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),output=path.join(root,'output');
 await cp(new URL('../website/public/art/roadmap/',import.meta.url),source,{recursive:true});
 await writeFile(path.join(source,'private.txt'),'not eligible');
 const files=await copyRoadmapProvenance({sourceDirectory:source,outputDirectory:output});
 assert.equal(files.length,6);assert.deepEqual((await readdir(path.join(output,'art/roadmap'))).sort(),files.sort());
 for(const name of files)assert.deepEqual(await readFile(path.join(output,'art/roadmap',name)),await readFile(path.join(source,name)));
 const prompt=path.join(source,'understanding-v1.prompt.json'),original=await readFile(prompt);
 await writeFile(prompt,'{}');
 await assert.rejects(copyRoadmapProvenance({sourceDirectory:source,outputDirectory:path.join(root,'tampered')}),/prompt hash mismatch/);
 await writeFile(prompt,original);
 const manifestFile=path.join(source,'manifest.json'),manifest=JSON.parse(await readFile(manifestFile));
 manifest.assets[0].promptFile='../private.txt';await writeFile(manifestFile,JSON.stringify(manifest));
 await assert.rejects(copyRoadmapProvenance({sourceDirectory:source,outputDirectory:path.join(root,'escaped')}),/allowlist/);
});
