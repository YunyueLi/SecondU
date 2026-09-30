import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {createDirectoryChooser} from '../server/directory-picker.mjs';
import {createApp} from '../server/index.mjs';
const {installDirectoryPicker}=createRequire(import.meta.url)('../desktop/directory-picker.cjs');

function desktopPickerSetup(showOpenDialog){
  const origin='http://127.0.0.1:58645';
  const frame={url:origin+'/?desktop=1'};
  const window={webContents:Object.assign(new EventEmitter(),{mainFrame:frame,getURL:()=>frame.url}),isDestroyed:()=>false};
  let handler,calls=0;
  installDirectoryPicker({ipcMain:{handle(name,fn){assert.equal(name,'hither:choose-directory');handler=fn;}},dialog:{async showOpenDialog(parent,options){calls++;assert.equal(parent,window);assert.deepEqual(options.properties,['openDirectory']);return showOpenDialog();}},getWindow:()=>window,getOrigin:()=>origin});
  const event={sender:window.webContents,senderFrame:frame};
  return {frame,window,event,choose:(changes={})=>handler({...event,...changes}),calls:()=>calls};
}

test('desktop chooser opens the native folder dialog only for its current main frame',async()=>{
  const f=desktopPickerSetup(async()=>({canceled:false,filePaths:['/tmp/chosen project']}));
  assert.equal(await f.choose(),'/tmp/chosen project');
  for(const changes of [{sender:{}},{senderFrame:{url:f.frame.url}},{senderFrame:null}])await assert.rejects(f.choose(changes),/cannot choose/);
  assert.equal(f.calls(),1);
  const cancel=desktopPickerSetup(async()=>({canceled:true,filePaths:[]}));assert.equal(await cancel.choose(),null);
});

test('desktop chooser rejects concurrent and stale choices and recovers after a dialog failure',async()=>{
  let release;
  const f=desktopPickerSetup(()=>new Promise(resolve=>{release=resolve;}));
  const first=f.choose();await assert.rejects(f.choose(),/already open/);assert.equal(f.calls(),1);
  f.window.webContents.mainFrame={url:f.frame.url};release({canceled:false,filePaths:['/tmp/stale']});
  await assert.rejects(first,/window changed/);
  const second=f.choose({senderFrame:f.window.webContents.mainFrame});release({canceled:true,filePaths:[]});assert.equal(await second,null);
  const reload=f.choose({senderFrame:f.window.webContents.mainFrame});f.window.webContents.emit('did-start-navigation',{isMainFrame:true});release({canceled:false,filePaths:['/tmp/previous-page']});await assert.rejects(reload,/window changed/);
  assert.equal(f.window.webContents.listenerCount('did-start-navigation'),0);
  let failed=true;
  const recover=desktopPickerSetup(async()=>{if(failed){failed=false;throw new Error('Dialog failed');}return {canceled:false,filePaths:['/tmp/recovered']};});
  await assert.rejects(recover.choose(),/Dialog failed/);assert.equal(await recover.choose(),'/tmp/recovered');
});

test('native folder choice uses fixed commands, preserves chosen text, and cancellation is null',async()=>{
  const calls=[];const selected='/tmp/project with "quotes" and $(literal)/';
  const picker=createDirectoryChooser({platform:'darwin',run:async(...args)=>{calls.push(args);return {stdout:selected+'\n'};}});
  assert.equal(await picker(),selected);assert.equal(calls[0][0],'/usr/bin/osascript');assert.match(calls[0][1][1],/choose folder/);assert.match(calls[0][1][1],/on error number -128/);assert.equal(calls[0][1][1].includes(selected),false);assert.equal(calls[0][2].shell,undefined);
  assert.equal(await createDirectoryChooser({platform:'darwin',run:async()=>({stdout:'\n'})})(),null);
  const windows=createDirectoryChooser({platform:'win32',run:async(command,args)=>{assert.equal(command,'powershell.exe');assert.ok(args.includes('-STA'));assert.match(args.at(-1),/FolderBrowserDialog/);return {stdout:'C:\\project'};}});assert.equal(await windows(),'C:\\project');
});

test('missing dialogs, diagnostic failures and timeout remain errors; no unrelated picker fallback',async()=>{
  const failure=error=>async()=>{throw error;};
  assert.equal(await createDirectoryChooser({platform:'linux',run:failure({code:1,stderr:''})})(),null);
  await assert.rejects(createDirectoryChooser({platform:'linux',run:failure({code:1,stderr:'cannot open display'})})(),{code:'directory_picker_failed'});
  await assert.rejects(createDirectoryChooser({platform:'linux',run:failure({code:'ENOENT'})})(),{code:'directory_picker_unavailable'});
  await assert.rejects(createDirectoryChooser({platform:'darwin',run:failure({killed:true})})(),{code:'directory_picker_timeout'});
});

test('one picker may be open at once and the next request works after cancellation',async()=>{
  let finish;const picker=createDirectoryChooser({platform:'darwin',run:()=>new Promise(resolve=>{finish=resolve;})});
  const first=picker();await assert.rejects(picker(),{code:'directory_picker_busy'});finish({stdout:''});assert.equal(await first,null);
  const second=picker();finish({stdout:'/tmp/second\n'});assert.equal(await second,'/tmp/second');
});

test('folder selection endpoint obeys local JSON guards and does not create a project or read files',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'hither-directory-picker-'));let calls=0;
  const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},chooseDirectory:async()=>{calls++;return calls===1?'/tmp/not-opened-or-read':null;}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${app.server.address().port}/api/projects/choose-directory`;
  const request=(headers={},body='{}')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
  const selected=await request();assert.equal(selected.status,200);assert.deepEqual(await selected.json(),{path:'/tmp/not-opened-or-read'});assert.equal(app.store.list('projects').length,0);assert.equal(app.store.list('sources').length,0);
  assert.deepEqual(await (await request()).json(),{path:null});
  assert.equal((await request({Origin:'https://outside.test'})).status,403);assert.equal((await request({'Content-Type':'text/plain'})).status,415);assert.equal((await request({},JSON.stringify({script:'untrusted'}))).status,400);assert.equal((await fetch(url)).status,405);assert.equal(calls,2);
});
