import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isBuiltin} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {copyDesktopRuntime,desktopRuntimePackages} from '../scripts/package-twin-mcp.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const execFileAsync=promisify(execFile);
async function temporary(t){const directory=await realpath(await mkdtemp(path.join(os.tmpdir(),'secondu-runtime-package-')));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}

test('the desktop runtime allowlist covers all packaged source imports',async()=>{
  const dependencies=new Set();
  for(const directory of ['server','shared','desktop'])for(const entry of await readdir(path.join(root,directory),{recursive:true,withFileTypes:true})){
    if(!entry.isFile()||!/[.](?:mjs|cjs|js)$/.test(entry.name))continue;
    const file=path.join(entry.parentPath,entry.name),source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    function visit(node){
      let specifier;
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specifier=node.moduleSpecifier.text;
      if(ts.isCallExpression(node)&&((ts.isIdentifier(node.expression)&&node.expression.text==='require')||node.expression.kind===ts.SyntaxKind.ImportKeyword)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))specifier=node.arguments[0].text;
      if(specifier&&!specifier.startsWith('.')&&!specifier.startsWith('/')&&!isBuiltin(specifier)){
        const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];
        dependencies.add(name);
        assert.ok(name==='electron'||desktopRuntimePackages.includes(name),`${path.relative(root,file)} requires unpackaged ${specifier}`);
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  assert.ok(dependencies.has('fast-xml-parser'));
  assert.ok(dependencies.has('@modelcontextprotocol/server'));
});

test('packaged service starts and reads finance with only its copied production runtime',async t=>{
  const directory=await temporary(t),packaged=path.join(directory,'app');
  await mkdir(packaged);
  await copyDesktopRuntime(root,packaged);
  for(const name of ['server','shared'])await cp(path.join(root,name),path.join(packaged,name),{recursive:true});
  const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  await writeFile(path.join(packaged,'package.json'),JSON.stringify({name:manifest.name,version:manifest.version,type:'module',hitherPackaged:true}));
  const program=`
    import assert from 'node:assert/strict';
    import {XMLParser,XMLValidator} from 'fast-xml-parser';
    import {createApp,VERSION} from './server/index.mjs';
    assert.ok(import.meta.resolve('fast-xml-parser').includes('/app/node_modules/fast-xml-parser/'));
    assert.equal(XMLValidator.validate('<account><balance>12.34</balance></account>'),true);
    assert.equal(new XMLParser().parse('<account><balance>12.34</balance></account>').account.balance,12.34);
    const app=createApp({dataDir:${JSON.stringify(path.join(directory,'data'))},seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
    try{
      await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
      const origin='http://127.0.0.1:'+app.server.address().port;
      const health=await fetch(origin+'/api/health');assert.equal(health.status,200);assert.equal((await health.json()).version,VERSION);
      const finance=await fetch(origin+'/api/finance/state');assert.equal(finance.status,200);assert.deepEqual((await finance.json()).accounts,[]);
      console.log('Independent packaged service and XML runtime passed');
    }finally{await app.close();}
  `;
  const environment={...process.env};delete environment.NODE_PATH;delete environment.NODE_OPTIONS;
  const result=await execFileAsync(process.execPath,['--input-type=module','--eval',program],{cwd:packaged,env:environment,timeout:20000,maxBuffer:1024*1024});
  assert.match(result.stdout,/Independent packaged service and XML runtime passed/);
  const top=await readdir(path.join(packaged,'node_modules'));
  assert.ok(!top.includes('typescript')&&!top.includes('react')&&!top.includes('electron'));
  assert.deepEqual((await readdir(path.join(packaged,'node_modules','@modelcontextprotocol'))).sort(),['core','server']);
});

test('runtime packaging rejects missing, changed, development and unreviewed dependencies before copying',async t=>{
  const directory=await temporary(t),project=path.join(directory,'source');
  const lock={lockfileVersion:3,packages:{}};
  for(const name of desktopRuntimePackages){
    const relative='node_modules/'+name;await mkdir(path.join(project,relative),{recursive:true});
    await writeFile(path.join(project,relative,'package.json'),JSON.stringify({name,version:'1.0.0'}));
    lock.packages[relative]={version:'1.0.0'};
  }
  const lockFile=path.join(project,'package-lock.json'),parser='node_modules/fast-xml-parser',parserFile=path.join(project,parser,'package.json');
  const cases=[
    {label:'missing',mutate:()=>{delete lock.packages[parser];},error:/production dependency lock/},
    {label:'version',mutate:()=>{lock.packages[parser].version='2.0.0';},error:/production dependency lock/},
    {label:'development',mutate:()=>{lock.packages[parser].dev=true;},error:/production dependency lock/},
    {label:'metadata',mutate:()=>{lock.packages[parser].dependencies={unreviewed:'1.0.0'};},error:/metadata differs/},
    {label:'new-dependency',mutate:async()=>{lock.packages[parser].dependencies={unreviewed:'1.0.0'};await writeFile(parserFile,JSON.stringify({name:'fast-xml-parser',version:'1.0.0',dependencies:{unreviewed:'1.0.0'}}));},error:/unreviewed dependency/},
    {label:'nested',mutate:async()=>{await mkdir(path.join(project,parser,'node_modules','surprise'),{recursive:true});},error:/nested dependency/},
  ];
  for(const item of cases){
    lock.packages[parser]={version:'1.0.0'};await writeFile(parserFile,JSON.stringify({name:'fast-xml-parser',version:'1.0.0'}));
    await item.mutate();await writeFile(lockFile,JSON.stringify(lock));
    const output=path.join(directory,item.label);
    await assert.rejects(copyDesktopRuntime(project,output),item.error);
    await assert.rejects(readdir(output),{code:'ENOENT'});
  }
});
