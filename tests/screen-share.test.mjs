import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {installScreenShare,chooseDesktopSource,chooserHtml}=createRequire(import.meta.url)('../desktop/screen-share.cjs');
const origin='http://127.0.0.1:58645';
function setup(options={}){
 const handlers={},frame={url:origin+'/?desktop=1'},session={setPermissionCheckHandler:fn=>handlers.check=fn,setPermissionRequestHandler:fn=>handlers.permission=fn,setDisplayMediaRequestHandler:(fn,options)=>{handlers.display=fn;handlers.options=options;}};
 const wc={session,mainFrame:frame,getURL:()=>frame.url},window={webContents:wc,isDestroyed:()=>false};
 const sources=[{id:'screen:1',name:'Screen 1'},{id:'window:2',name:'Test window'}];
 let calls=0;
 const bridge=installScreenShare(window,{origin,legacyMediaPermission:true,desktopCapturer:{async getSources(args){calls++;assert.deepEqual(args.thumbnailSize,{width:0,height:0});return sources;}},systemPreferences:{getMediaAccessStatus:()=> 'granted'},chooseSource:async()=>sources[1],...options});
 const request={frame,securityOrigin:origin,userGesture:true,videoRequested:true,audioRequested:false};
 const run=async changes=>{const answers=[];await handlers.display({...request,...changes},value=>answers.push(value));return answers;};
 return {handlers,frame,wc,window,sources,bridge,run,calls:()=>calls};
}
test('capture permissions are limited to the trusted top-level display request',async()=>{
 const f=setup();assert.equal(f.handlers.options.useSystemPicker,true);
 assert.equal(f.handlers.check(f.wc,'display-capture',origin,{isMainFrame:true,requestingUrl:origin}),true);
 for(const [wc,permission,url,main] of [[{},'display-capture',origin,true],[f.wc,'media',origin,true],[f.wc,'display-capture','https://outside.test',true],[f.wc,'display-capture',origin,false]]){
   assert.equal(f.handlers.check(wc,permission,url,{isMainFrame:main,requestingUrl:url}),false);
   f.handlers.permission(wc,permission,allowed=>assert.equal(allowed,false),{isMainFrame:main,requestingUrl:url});
 }
 for(const invalid of [{userGesture:false},{frame:{url:origin}},{securityOrigin:'https://outside.test'},{audioRequested:true},{videoRequested:false}])assert.deepEqual(await f.run(invalid),[{}]);
 assert.equal(f.calls(),0);
 const legacy={isMainFrame:true,requestingUrl:origin,securityOrigin:origin,mediaTypes:[]};
 f.handlers.permission(f.wc,'media',allowed=>assert.equal(allowed,true),legacy);
 for(const change of [{mediaTypes:['audio']},{mediaTypes:['video']},{mediaTypes:undefined},{securityOrigin:'https://outside.test'},{isMainFrame:false}])f.handlers.permission(f.wc,'media',allowed=>assert.equal(allowed,false),{...legacy,...change});
 const modern=setup({legacyMediaPermission:false});modern.handlers.permission(modern.wc,'media',allowed=>assert.equal(allowed,false),legacy);
 Object.defineProperty(f.frame,'url',{get(){throw Error('Frame disposed');}});
 assert.deepEqual(await f.run(),[{}]);
});
test('fallback returns only the explicitly chosen source, never the first screen or audio',async()=>{
 const f=setup();assert.deepEqual(await f.run(),[{video:f.sources[1]}]);assert.equal(f.bridge.getStatus().selection,'approved');assert.equal(f.bridge.getStatus().remoteControl,false);
 const cancel=setup({chooseSource:async()=>undefined});assert.deepEqual(await cancel.run(),[{}]);assert.equal(cancel.bridge.getStatus().selection,'cancelled');
 const failure=setup({chooseSource:async()=>{throw Error('private window title must not escape');}});assert.deepEqual(await failure.run(),[{}]);assert.equal(failure.bridge.getStatus().lastError.code,'capture_unavailable');assert.doesNotMatch(JSON.stringify(failure.bridge.getStatus()),/private window title/);
});
test('concurrent capture is rejected and a changed requesting page cannot receive a stale source',async()=>{
 let release;const f=setup({chooseSource:()=>new Promise(resolve=>{release=resolve;})});
 const first=f.run();await Promise.resolve();assert.deepEqual(await f.run(),[{}]);assert.equal(f.calls(),1);
 f.frame.url='https://outside.test';release(f.sources[1]);assert.deepEqual(await first,[{}]);assert.equal(f.bridge.getStatus().lastError.code,'selection_stale');
});
test('fallback chooser isolates its renderer, validates IPC sender and cleans up on cancel',async()=>{
 const ipcMain=new EventEmitter(),parent=new EventEmitter();let chooser;
 class FakeWindow extends EventEmitter{
   constructor(options){super();chooser=this;this.options=options;this.closed=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}},setWindowOpenHandler(){}});}
   isDestroyed(){return this.closed;}close(){this.closed=true;this.emit('closed');}show(){}async loadURL(url){this.url=url;}
 }
 const sources=[{id:'screen:1',name:'<img src=x onerror=alert(1)>'}];
 const promise=chooseDesktopSource(parent,sources,{BrowserWindow:FakeWindow,ipcMain});
 assert.equal(chooser.options.webPreferences.nodeIntegration,false);assert.equal(chooser.options.webPreferences.contextIsolation,true);assert.equal(chooser.options.webPreferences.sandbox,true);
 ipcMain.emit('hither:screen-source-picked',{sender:{},senderFrame:{}},0);assert.equal(chooser.closed,false);
 ipcMain.emit('hither:screen-source-picked',{sender:chooser.webContents,senderFrame:{}},0);assert.equal(chooser.closed,false);
 ipcMain.emit('hither:screen-source-picked',{sender:chooser.webContents,senderFrame:chooser.webContents.mainFrame},99);assert.equal(chooser.closed,false);
 ipcMain.emit('hither:screen-source-picked',{sender:chooser.webContents,senderFrame:chooser.webContents.mainFrame},-1);assert.equal(await promise,undefined);assert.equal(ipcMain.listenerCount('hither:screen-source-picked'),0);
 const html=chooserHtml(sources);assert.ok(html.includes('&lt;img'));assert.equal(html.includes('<img src=x'),false);assert.ok(html.includes("connect-src 'none'"));
});
