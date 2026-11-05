import {createHash} from 'node:crypto';
import {createReadStream, existsSync} from 'node:fs';
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const exec = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../',import.meta.url));
export function validateCodexLock(lock) {
  if (lock?.schemaVersion!==1 || !/^\d+\.\d+\.\d+$/.test(lock.version) || !lock.artifacts || !Object.keys(lock.artifacts).length) throw new Error('Invalid stable Codex lock.');
  const targets = {'darwin-arm64':'aarch64-apple-darwin','darwin-x64':'x86_64-apple-darwin','linux-x64':'x86_64-unknown-linux-musl'};
  for (const [key,item] of Object.entries(lock.artifacts)) {
    if (!targets[key] || item.target!==targets[key] || item.url!==`https://registry.npmjs.org/@openai/codex/-/codex-${lock.version}-${key}.tgz` || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity)) throw new Error('Invalid pinned Codex artifact: '+key);
  }
  return lock;
}
export async function artifactIntegrity(file) {
  const hash=createHash('sha512');for await (const bytes of createReadStream(file)) hash.update(bytes);
  return 'sha512-'+hash.digest('base64');
}
async function regularTree(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if (entry.isDirectory()) await regularTree(file);
    else if (!entry.isFile()) throw new Error('Unexpected link or special file in Codex artifact.');
  }
}
/** Re-extract verified archives for each build; never trust an extracted cache. */
export async function packageCodexRuntime({root=projectRoot, output, platform=process.platform, arch=process.arch, lockFile=path.join(root,'shared/codex-runtime.json'), cacheDir=path.join(root,'.local/codex-runtime/vendor'), noticesDir=path.join(root,'docs/licenses')}={}) {
  const lock=validateCodexLock(JSON.parse(await readFile(lockFile,'utf8'))), key=`${platform}-${arch}`, artifact=lock.artifacts[key];
  if (!artifact) throw new Error('No reviewed Codex artifact for '+key);
  if (!output || existsSync(output)) throw new Error('Codex output must be a new directory.');
  await mkdir(cacheDir,{recursive:true});
  const archive=path.join(cacheDir,path.basename(new URL(artifact.url).pathname));
  if (!existsSync(archive)) {
    const partial=path.join(await mkdtemp(path.join(cacheDir,'download-')),'archive.tgz');
    try {
      await exec('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--silent','--show-error','--retry','2','--max-time','600','--output',partial,artifact.url],{timeout:620000});
      if (await artifactIntegrity(partial)!==artifact.integrity) throw new Error('Downloaded Codex archive failed its pinned integrity.');
      await rename(partial,archive);
    } finally {await rm(path.dirname(partial),{recursive:true,force:true});}
  }
  if (!(await lstat(archive)).isFile() || await artifactIntegrity(archive)!==artifact.integrity) throw new Error('Cached Codex archive failed its pinned integrity.');
  const staging=await mkdtemp(path.join(cacheDir,'extract-'));
  try {
    const listing=(await exec('tar',['-tzf',archive],{maxBuffer:4*1024*1024})).stdout.trim().split('\n');
    const types=(await exec('tar',['-tvzf',archive],{maxBuffer:4*1024*1024})).stdout.trim().split('\n');
    if (listing.some(name=>!name.startsWith('package/') || name.includes('\\') || name.split('/').includes('..')) || types.some(line=>!['-','d'].includes(line[0]))) throw new Error('Unsafe Codex archive entry.');
    await exec('tar',['-xzf',archive,'-C',staging],{maxBuffer:1024*1024});
    const source=path.join(staging,'package/vendor',artifact.target);
    await regularTree(path.join(staging,'package'));
    const metadata=JSON.parse(await readFile(path.join(staging,'package/package.json'),'utf8'));
    const layout=JSON.parse(await readFile(path.join(source,'codex-package.json'),'utf8'));
    if (metadata.name!=='@openai/codex' || metadata.version!==`${lock.version}-${key}` || layout.layoutVersion!==1 || layout.version!==lock.version || layout.target!==artifact.target || layout.entrypoint!=='bin/codex' || layout.pathDir!=='codex-path' || layout.resourcesDir!=='codex-resources') throw new Error('Unexpected Codex package identity or layout.');
    const command=path.join(source,'bin/codex');
    if (!(await lstat(command)).isFile() || !((await lstat(command)).mode&0o111)) throw new Error('Codex entrypoint is not executable.');
    if (platform===process.platform && arch===process.arch) {
      const home=path.join(staging,'home');await mkdir(home);
      const result=await exec(command,['--version'],{env:{PATH:process.env.PATH,HOME:home,CODEX_HOME:home},timeout:15000});
      if (result.stdout.trim()!==`codex-cli ${lock.version}`) throw new Error('Codex executable version differs from its lock.');
    }
    // Keep upstream companions, resources and embedded third-party notices intact.
    await mkdir(path.dirname(output),{recursive:true});
    const prepared=path.join(staging,'prepared');await cp(source,prepared,{recursive:true});
    await cp(path.join(staging,'package/package.json'),path.join(prepared,'upstream-package.json'));
    for (const name of ['LICENSE','NOTICE']) await cp(path.join(noticesDir,`codex-${lock.version}-${name}.txt`),path.join(prepared,name));
    const receipt={schemaVersion:1,version:lock.version,platform,arch,target:artifact.target,url:artifact.url,integrity:artifact.integrity};
    await writeFile(path.join(prepared,'build.json'),JSON.stringify(receipt,null,2)+'\n');
    await rename(prepared,output);
    return {command:path.join(output,'bin/codex'),...receipt};
  } finally {await rm(staging,{recursive:true,force:true});}
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if (!args[0] || args.length>3) throw new Error('Usage: node scripts/package-codex-runtime.mjs OUTPUT [LOCK_FILE] [NOTICES_DIR]');
  console.log(JSON.stringify(await packageCodexRuntime({output:path.resolve(args[0]),...(args[1]?{lockFile:path.resolve(args[1])}:{}),...(args[2]?{noticesDir:path.resolve(args[2])}:{})})));
}
