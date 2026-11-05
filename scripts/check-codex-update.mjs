import {appendFile, mkdir, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import lock from '../shared/codex-runtime.json' with {type:'json'};
import {validateCodexLock} from './package-codex-runtime.mjs';

const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const npm=async args=>JSON.parse((await exec(process.platform==='win32'?'npm.cmd':'npm',['view',...args,'--json'],{timeout:30000,maxBuffer:1024*1024})).stdout);
export function stableVersion(value) {
  if (typeof value!=='string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Expected an explicit stable Codex version.');
  return value;
}
export async function prepareCodexCandidate(version,{directory=path.join(root,'.local/codex-candidate'),metadata=npm}={}) {
  stableVersion(version);
  const entries=await Promise.all(Object.entries(lock.artifacts).map(async([key,artifact])=>{
    const result=await metadata([`@openai/codex@${version}-${key}`,'version','dist']);
    if (result.version!==`${version}-${key}`) throw new Error('Candidate package version differs from the requested version.');
    return [key,{target:artifact.target,url:result.dist.tarball,integrity:result.dist.integrity}];
  }));
  const candidate=validateCodexLock({schemaVersion:1,version,artifacts:Object.fromEntries(entries)});
  const notices=path.join(directory,'notices');await mkdir(notices,{recursive:true});
  for (const name of ['LICENSE','NOTICE']) {
    const result=await exec('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--silent','--show-error','--max-time','60',`https://raw.githubusercontent.com/openai/codex/rust-v${version}/${name}`],{timeout:65000,maxBuffer:1024*1024});
    if (!result.stdout.trim()) throw new Error('Missing candidate notice: '+name);
    await writeFile(path.join(notices,`codex-${version}-${name}.txt`),result.stdout);
  }
  await writeFile(path.join(directory,'lock.json'),JSON.stringify(candidate,null,2)+'\n');
  return candidate;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);if (args.length>1 || args.length && args[0]!=='--prepare') throw new Error('Usage: node scripts/check-codex-update.mjs [--prepare]');
  const latest=stableVersion(process.env.CODEX_CANDIDATE_VERSION || await npm(['@openai/codex','dist-tags.latest']));
  const newer=latest.split('.').map(Number).some((part,index,parts)=>parts.slice(0,index).every((n,i)=>n===Number(lock.version.split('.')[i])) && part>Number(lock.version.split('.')[index]));
  if (args[0]==='--prepare') await prepareCodexCandidate(latest);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,`version=${latest}\nnew_version=${newer}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,`Codex CLI: pinned **${lock.version}**, upstream stable **${latest}**. ${newer?'Candidate compatibility checks are required before changing the release pin.':'No newer stable version detected.'}\n\nThis job does not publish an app or change the installed CLI.\n`);
  console.log(JSON.stringify({pinned:lock.version,latest,newVersion:newer,prepared:args[0]==='--prepare'}));
}
