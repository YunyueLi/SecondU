const path = require('node:path');
const { randomUUID } = require('node:crypto');

function sameOrigin(value, origin) { try { return new URL(value).origin === origin; } catch { return false; } }
function trustedPermission(window, webContents, permission, requestingUrl, isMainFrame, origin) {
  try{return !window.isDestroyed() && webContents === window.webContents && permission === 'display-capture' && isMainFrame === true && sameOrigin(requestingUrl, origin) && sameOrigin(webContents.getURL(), origin);}catch{return false;}
}
function trustedDisplayRequest(window, request, origin) {
  try{return !window.isDestroyed() && request.frame === window.webContents.mainFrame && request.userGesture === true && request.videoRequested === true && request.audioRequested !== true && sameOrigin(request.securityOrigin, origin) && sameOrigin(request.frame?.url, origin);}catch{return false;}
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value])); }
function chooserHtml(sources, language='zh-CN') {
  const en=language==='en';
  return `<!doctype html><html lang="${en?'en':'zh-CN'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; connect-src 'none'"><style>body{margin:0;padding:24px;font:14px system-ui;color:#242424;background:#fff}h1{font-size:18px;font-weight:600;margin:0 0 8px}p{font-size:12px;line-height:1.6;color:#666}main{display:grid;gap:7px;max-height:330px;overflow:auto;margin:18px 0}button{font:inherit;cursor:pointer;border:1px solid #ddd;border-radius:9px;background:#fff;color:#242424;padding:11px 13px;text-align:left;white-space:normal;overflow-wrap:anywhere}button:hover{background:#f5f5f5}button:focus-visible{outline:2px solid #1769e0;outline-offset:2px}small{display:block;font-size:11px;color:#666;margin-top:3px}footer{display:flex;justify-content:flex-end}</style></head><body><h1>${en?'Choose what to share':'选择共享内容'}</h1><p>${en?'Preview only in SecondU. No computer control or automatic upload to a model.':'仅在 SecondU 内预览，不会控制电脑或自动发送给模型。'}</p><main>${sources.map((source,index)=>`<button data-source="${index}">${escapeHtml(source.name)}<small>${source.id.startsWith('screen:')?(en?'Screen':'屏幕'):(en?'Window':'窗口')}</small></button>`).join('')}</main><footer><button data-source="-1" autofocus>${en?'Cancel':'取消'}</button></footer><script>for(const button of document.querySelectorAll('[data-source]'))button.addEventListener('click',()=>window.hitherCaptureChooser.choose(Number(button.dataset.source)));document.addEventListener('keydown',event=>{if(event.key==='Escape')window.hitherCaptureChooser.choose(-1);});</script></body></html>`;
}

function chooseDesktopSource(parent, sources, {BrowserWindow, ipcMain, language='zh-CN'}) {
  return new Promise((resolve,reject)=>{
    const chooser = new BrowserWindow({parent,modal:true,width:620,height:550,minWidth:420,minHeight:350,show:false,title:language==='en'?'Share screen':'共享屏幕',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'screen-share-preload.cjs'),partition:`hither-capture-${randomUUID()}`,nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false}});
    let settled=false;
    const finish=(value,error)=>{if(settled)return;settled=true;clearTimeout(timer);ipcMain.removeListener('hither:screen-source-picked',onPick);parent.removeListener('closed',onParentClose);if(!chooser.isDestroyed())chooser.close();if(error)reject(error);else resolve(value);};
    const onPick=(event,index)=>{if(event.sender!==chooser.webContents||event.senderFrame!==chooser.webContents.mainFrame)return;if(index===-1)return finish();if(Number.isInteger(index)&&index>=0&&index<sources.length)finish(sources[index]);};
    const onParentClose=()=>finish();
    const timer=setTimeout(()=>finish(undefined,Object.assign(new Error('Source selection timed out'),{code:'selection_timeout'})),120000);timer.unref();
    ipcMain.on('hither:screen-source-picked',onPick);parent.once('closed',onParentClose);
    chooser.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    chooser.webContents.session.setPermissionCheckHandler(()=>false);
    chooser.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    chooser.webContents.on('will-navigate',event=>event.preventDefault());
    chooser.once('closed',()=>finish());
    chooser.once('ready-to-show',()=>{if(!settled)chooser.show();});
    chooser.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(chooserHtml(sources,language))}`).catch(()=>finish(undefined,Object.assign(new Error('Source selector could not open'),{code:'selector_failed'})));
  });
}

function installScreenShare(window, {origin,BrowserWindow,ipcMain,desktopCapturer,systemPreferences,chooseSource=chooseDesktopSource,getLanguage=()=> 'zh-CN',legacyMediaPermission=Number(process.versions.electron?.split('.')[0])===38}) {
  let selecting=false;
  let status={selection:'idle',lastError:null};
  function error(code,message){status={selection:'error',lastError:{code,message}};console.warn(`[hither:screen-share] ${code}`);}
  const session=window.webContents.session;
  session.setPermissionCheckHandler((wc,permission,requestingOrigin,details)=>trustedPermission(window,wc,permission,details?.requestingUrl||requestingOrigin,details?.isMainFrame,origin));
  session.setPermissionRequestHandler((wc,permission,callback,details)=>{
    // Electron 38 reports display capture as `media` with no camera/mic types.
    // Do not grant media generally, or return true for its preliminary check.
    const legacyDisplay=legacyMediaPermission&&permission==='media'&&Array.isArray(details?.mediaTypes)&&details.mediaTypes.length===0&&sameOrigin(details.securityOrigin,origin);
    callback(trustedPermission(window,wc,legacyDisplay?'display-capture':permission,details?.requestingUrl,details?.isMainFrame,origin));
  });
  session.setDisplayMediaRequestHandler(async(request,callback)=>{
    let responded=false;const respond=streams=>{if(responded)return;responded=true;callback(streams);};
    if(!trustedDisplayRequest(window,request,origin)){error('request_not_allowed',getLanguage()==='en'?'Choose a screen to share from SecondU.':'请从 SecondU 中主动选择共享画面。');respond({});return;}
    if(selecting){error('selection_in_progress',getLanguage()==='en'?'A screen picker is already open. Complete or cancel it first.':'已有画面选择窗口，请先完成或取消。');respond({});return;}
    selecting=true;status={selection:'selecting',lastError:null};
    try{
      // No screenshots, thumbnails, source titles or identifiers are persisted.
      const sources=(await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false})).slice(0,200);
      if(!sources.length)throw Object.assign(new Error('No capture sources'),{code:'no_sources'});
      const selected=await chooseSource(window,sources,{BrowserWindow,ipcMain,language:getLanguage()});
      if(!selected){status={selection:'cancelled',lastError:null};respond({});return;}
      if(!trustedDisplayRequest(window,request,origin)||!sources.some(source=>source===selected))throw Object.assign(new Error('The requesting page or source changed'),{code:'selection_stale'});
      status={selection:'approved',lastError:null};respond({video:selected});
    }catch(failure){const code=['selection_timeout','selector_failed','no_sources','selection_stale'].includes(failure?.code)?failure.code:'capture_unavailable';error(code,getLanguage()==='en'?'Could not share the screen. Check screen recording permissions or choose another window.':'无法共享画面。请检查系统录屏权限，或重新选择窗口。');respond({});}
    finally{selecting=false;}
  },{useSystemPicker:true});
  return {getStatus(){let permission='unknown';try{if(process.platform==='darwin')permission=systemPreferences.getMediaAccessStatus('screen');}catch{}return {available:true,systemPickerPreferred:true,screenPermission:permission,remoteControl:false,...status};}};
}

module.exports={installScreenShare,chooseDesktopSource,trustedPermission,trustedDisplayRequest,chooserHtml};
