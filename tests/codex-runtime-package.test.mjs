import test from 'node:test';
import assert from 'node:assert/strict';
import {chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {codexCommand} from '../server/codex-runtime.mjs';
import lock from '../shared/codex-runtime.json' with {type:'json'};
import {artifactIntegrity, packageCodexRuntime, validateCodexLock} from '../scripts/package-codex-runtime.mjs';
import {computeRuntimeRevision} from '../server/runtime-revision.mjs';

async function fixture(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'secondu-codex-package-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'package.json'),JSON.stringify({hitherPackaged:true}));
  const directory=path.join(root,'runtime/codex');await mkdir(path.join(directory,'bin'),{recursive:true});
  const artifact=lock.artifacts['darwin-arm64'];
  const receipt={schemaVersion:1,version:lock.version,platform:'darwin',arch:'arm64',integrity:artifact.integrity};
  await writeFile(path.join(directory,'build.json'),JSON.stringify(receipt));
  const command=path.join(directory,'bin/codex');await writeFile(command,'fixture');await chmod(command,0o755);
  return {root,directory,command,receipt,options:{root,platform:'darwin',arch:'arm64',env:{PATH:'/unavailable',HITHER_CODEX_BIN:'/untrusted/override',HITHER_CODEX_BINARY:'/legacy/override'}}};
}
test('installed apps select only their owned pinned CLI, including with inherited overrides',async t=>{
  const f=await fixture(t);assert.equal(codexCommand(f.options),f.command);
  await writeFile(path.join(f.root,'package.json'),'{}');
  assert.equal(codexCommand(f.options),'/untrusted/override');
  assert.equal(codexCommand({...f.options,env:{PATH:'/unavailable',HITHER_CODEX_BINARY:'/legacy/override'}}),'/legacy/override');
});
test('missing, mismatched and nonexecutable bundled components never fall through to a global CLI',async t=>{
  const f=await fixture(t);
  for (const change of [{version:'0.0.0'},{platform:'linux'},{arch:'x64'},{integrity:'changed'},{schemaVersion:2}]) {
    await writeFile(path.join(f.directory,'build.json'),JSON.stringify({...f.receipt,...change}));
    assert.throws(()=>codexCommand(f.options),{code:'CODEX_BUNDLE_INVALID'});
  }
  await writeFile(path.join(f.directory,'build.json'),JSON.stringify(f.receipt));
  await chmod(f.command,0o644);assert.throws(()=>codexCommand(f.options),{code:'CODEX_BUNDLE_INVALID'});
  await rm(f.command);assert.throws(()=>codexCommand(f.options),{code:'CODEX_BUNDLE_INVALID'});
});
test('runtime lock rejects moving versions, substituted sources, platforms and missing integrity',()=>{
  assert.equal(validateCodexLock(lock),lock);
  for (const patch of [{version:'latest'},{version:'0.165.0-alpha.1'},{artifacts:{}},{artifacts:{'darwin-arm64':{...lock.artifacts['darwin-arm64'],url:'https://example.test/codex.tgz'}}},{artifacts:{'darwin-arm64':{...lock.artifacts['darwin-arm64'],integrity:''}}}]) assert.throws(()=>validateCodexLock({...lock,...patch}));
});
test('modified cached archives fail before extraction or creating an output',async t=>{
  const f=await fixture(t),cacheDir=path.join(f.root,'cache'),output=path.join(f.root,'output');await mkdir(cacheDir);
  await cp(new URL('../shared/codex-runtime.json',import.meta.url),path.join(f.root,'lock.json'));
  const archive=path.join(cacheDir,path.basename(lock.artifacts['darwin-arm64'].url));await writeFile(archive,'modified archive');
  assert.notEqual(await artifactIntegrity(archive),lock.artifacts['darwin-arm64'].integrity);
  await assert.rejects(packageCodexRuntime({root:f.root,output,cacheDir,lockFile:path.join(f.root,'lock.json'),platform:'darwin',arch:'arm64'}),/pinned integrity/);
  await assert.rejects(readFile(output),{code:'ENOENT'});
});
test('bundled runtime identity prevents reusing a backend with a different executable bundle',async t=>{
  const f=await fixture(t);for(const dir of ['server','shared'])await mkdir(path.join(f.root,dir));
  const bundled=computeRuntimeRevision(f.root);
  await rm(path.join(f.directory,'build.json'));const external=computeRuntimeRevision(f.root);assert.notEqual(bundled,external);
  await writeFile(path.join(f.directory,'build.json'),JSON.stringify({...f.receipt,version:'0.0.0'}));assert.notEqual(computeRuntimeRevision(f.root),bundled);
});
