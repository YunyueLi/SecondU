import {cp,lstat,mkdir,mkdtemp,open,readFile,readdir,readlink,rename,rm,writeFile} from 'node:fs/promises';
import {existsSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const minimumMacOSVersion='13.0';
const command=(file,args,options={})=>execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
export async function sha256(file){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
export function validateUpdaterConfig(value){
  if(!value||Object.keys(value).some(key=>!['feedURL','publicEDKey'].includes(key)))throw new Error('Unexpected updater configuration.');
  let url;try{url=new URL(value.feedURL);}catch{throw new Error('The updater requires a fixed HTTPS feed URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new Error('The updater requires a fixed HTTPS feed without credentials, query or fragment.');
  if(typeof value.publicEDKey!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(value.publicEDKey)||Buffer.from(value.publicEDKey,'base64').length!==32||Buffer.from(value.publicEDKey,'base64').toString('base64')!==value.publicEDKey)throw new Error('The updater requires a canonical 32-byte EdDSA public key.');
  return {feedURL:url.href,publicEDKey:value.publicEDKey};
}
export function updaterPlistValues(config){
  const value=validateUpdaterConfig(config);
  return {SUFeedURL:value.feedURL,SUPublicEDKey:value.publicEDKey,SUEnableAutomaticChecks:false,SUAutomaticallyUpdate:false,SUAllowsAutomaticUpdates:false,SUVerifyUpdateBeforeExtraction:true,SUEnableSystemProfiling:false,SUEnableJavaScript:false};
}
export function applyUpdaterPlist(plist,config){
  const minimum=plist.match(/<key>LSMinimumSystemVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if(minimum!==minimumMacOSVersion)throw new Error('Electron, the native updater and the appcast must agree on minimum macOS '+minimumMacOSVersion+'.');
  const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
  const values=updaterPlistValues(config);
  for(const key of Object.keys(values))if(plist.includes(`<key>${key}</key>`))throw new Error('Updater plist configuration already exists: '+key);
  const entries=Object.entries(values).map(([key,value])=>`\t<key>${key}</key>\n\t${typeof value==='boolean'?`<${value}/>`:`<string>${escape(value)}</string>`}`).join('\n');
  if(!/<\/dict>\s*<\/plist>\s*$/.test(plist))throw new Error('Unexpected application plist structure.');
  return plist.replace(/<\/dict>\s*<\/plist>\s*$/,`${entries}\n</dict>\n</plist>\n`);
}
async function checkedArchive(lock,cache){
  const file=path.join(cache,path.basename(new URL(lock.url).pathname));
  if(!existsSync(file)){
    const temporary=file+`.download-${process.pid}`;
    try{command('/usr/bin/curl',['--fail','--location','--proto','=https','--proto-redir','=https','--silent','--show-error','--retry','2','--max-time','180','--output',temporary,lock.url]);
      if(await sha256(temporary)!==lock.sha256||(lock.bytes!==undefined&&(await lstat(temporary)).size!==lock.bytes))throw new Error('Downloaded updater dependency failed its pinned hash: '+lock.url);
      await rename(temporary,file);
    }finally{await rm(temporary,{force:true});}
  }
  const stat=await lstat(file);if(!stat.isFile()||await sha256(file)!==lock.sha256||(lock.bytes!==undefined&&stat.size!==lock.bytes))throw new Error('Cached updater dependency failed its pinned hash: '+file);
  return file;
}
export async function frameworkInventory(root){
  const result=[];
  async function visit(relative=''){
    for(const name of (await readdir(path.join(root,relative))).sort()){
      const file=path.join(root,relative,name),entry=relative?relative+'/'+name:name,stat=await lstat(file);
      if(stat.isSymbolicLink())result.push({path:entry,type:'link',target:await readlink(file)});
      else if(stat.isDirectory()){result.push({path:entry,type:'directory',mode:stat.mode&0o777});await visit(entry);}
      else if(stat.isFile())result.push({path:entry,type:'file',mode:stat.mode&0o777,sha256:await sha256(file)});
      else throw new Error('Unexpected updater framework entry: '+entry);
    }
  }
  await visit();return result;
}
export async function buildUpdater({root=projectRoot,arch=process.arch,cacheDir=path.join(root,'.local/updater/vendor'),outputDir}={}){
  if(process.platform!=='darwin')throw new Error('Building the native updater requires macOS and Xcode command line tools.');
  if(!['arm64','x64'].includes(arch))throw new Error('Unsupported updater architecture.');
  const lock=JSON.parse(await readFile(path.join(root,'desktop/native/vendor-lock.json'),'utf8'));
  await mkdir(cacheDir,{recursive:true});
  const sparkleArchive=await checkedArchive(lock.sparkle,cacheDir),headersArchive=await checkedArchive(lock.nodeHeaders,cacheDir);
  // Extract each verified archive afresh: a modified cached framework must not
  // inherit trust merely because its original archive is still present.
  const staging=await mkdtemp(path.join(cacheDir,'build-'));
  try{
    const sparkle=path.join(staging,'sparkle'),headers=path.join(staging,'headers');await mkdir(sparkle);await mkdir(headers);
    command('/usr/bin/tar',['-xJf',sparkleArchive,'-C',sparkle]);command('/usr/bin/tar',['-xzf',headersArchive,'-C',headers]);
    const framework=path.join(sparkle,'Sparkle.framework');command('/usr/bin/codesign',['--verify','--deep','--strict',framework]);
    const destination=outputDir??await mkdtemp(path.join(root,'.local/updater/native-'));await mkdir(destination,{recursive:true});
    const addon=path.join(destination,'updater.node');if(existsSync(addon)||existsSync(path.join(destination,'Sparkle.framework')))throw new Error('Native updater output already exists.');
    const sdk=command('/usr/bin/xcrun',['--show-sdk-path']).trim();
    command('/usr/bin/xcrun',['clang++','-std=c++17','-fobjc-arc','-fblocks','-fvisibility=hidden','-DNAPI_VERSION=8','-DNODE_GYP_MODULE_NAME=secondu_updater','-mmacosx-version-min='+minimumMacOSVersion,'-arch',arch==='x64'?'x86_64':arch,'-isysroot',sdk,'-I',path.join(headers,`node-v${lock.nodeHeaders.version}/include/node`),'-F',sparkle,'-framework','Cocoa','-framework','Sparkle','-bundle','-undefined','dynamic_lookup','-Wl,-rpath,@loader_path/../../../../Frameworks',path.join(root,'desktop/native/updater.mm'),path.join(root,'desktop/native/RelaunchGate.mm'),'-o',addon]);
    command('/usr/bin/codesign',['--force','--sign','-',addon]);
    const copiedFramework=path.join(destination,'Sparkle.framework');await cp(framework,copiedFramework,{recursive:true,verbatimSymlinks:true});
    const before=await frameworkInventory(framework),after=await frameworkInventory(copiedFramework);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Copying Sparkle changed its signed bytes, modes or symlinks.');
    command('/usr/bin/codesign',['--verify','--deep','--strict',copiedFramework]);
    const manifest={schemaVersion:1,sparkle:lock.sparkle,nodeHeaders:lock.nodeHeaders,architecture:arch,napiVersion:8,addonSha256:await sha256(addon),frameworkInventorySha256:createHash('sha256').update(JSON.stringify(after)).digest('hex'),frameworkEntries:after.length};
    await writeFile(path.join(destination,'build.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    return {directory:destination,addon,framework:copiedFramework,manifest};
  }finally{await rm(staging,{recursive:true,force:true});}
}
export async function embedUpdater(appBundle,{root=projectRoot,build}={}){
  const compiled=build??await buildUpdater({root});const targetFramework=path.join(appBundle,'Contents/Frameworks/Sparkle.framework');
  if(existsSync(targetFramework))throw new Error('Sparkle framework already exists in the package.');
  await cp(compiled.framework,targetFramework,{recursive:true,verbatimSymlinks:true});
  const native=path.join(appBundle,'Contents/Resources/app/desktop/native');await mkdir(native,{recursive:true});await cp(compiled.addon,path.join(native,'updater.node'));
  if(JSON.stringify(await frameworkInventory(compiled.framework))!==JSON.stringify(await frameworkInventory(targetFramework)))throw new Error('Embedded Sparkle framework was modified.');
  command('/usr/bin/codesign',['--verify','--deep','--strict',targetFramework]);
  return compiled;
}
export async function signUpdaterApp(appBundle){
  // Sign only code we own, inside out. Never re-sign Sparkle's nested helpers:
  // its installer entitlements and signed identifiers are supplied upstream.
  const frameworks=path.join(appBundle,'Contents/Frameworks'),sparkle=path.join(frameworks,'Sparkle.framework');
  const sparkleBefore=await frameworkInventory(sparkle),files=[],bundles=[];
  const macho=new Set(['feedface','cefaedfe','feedfacf','cffaedfe','cafebabe','bebafeca','cafebabf','bfbafeca']);
  async function collect(directory){
    for(const name of await readdir(directory)){
      const file=path.join(directory,name);if(file===sparkle)continue;
      const stat=await lstat(file);if(stat.isSymbolicLink())continue;
      if(stat.isDirectory()){await collect(file);if(/\.(app|framework|xpc)$/.test(name))bundles.push(file);}
      else if(stat.isFile()){const handle=await open(file,'r');try{const bytes=Buffer.alloc(4);await handle.read(bytes,0,4,0);if(macho.has(bytes.toString('hex')))files.push(file);}finally{await handle.close();}}
    }
  }
  await collect(frameworks);
  // Electron's downloadable development runtime has linker signatures rather
  // than complete sealed bundles. Seal its leaves and then containing bundles.
  for(const file of [...files,...bundles])command('/usr/bin/codesign',['--force','--sign','-','--preserve-metadata=entitlements',file]);
  command('/usr/bin/codesign',['--force','--sign','-',path.join(appBundle,'Contents/Resources/app/desktop/native/updater.node')]);
  command('/usr/bin/codesign',['--verify','--deep','--strict',sparkle]);
  command('/usr/bin/codesign',['--force','--sign','-',appBundle]);
  command('/usr/bin/codesign',['--verify','--deep','--strict',appBundle]);
  if(JSON.stringify(sparkleBefore)!==JSON.stringify(await frameworkInventory(sparkle)))throw new Error('Signing modified the official Sparkle framework.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildUpdater(),null,2));
