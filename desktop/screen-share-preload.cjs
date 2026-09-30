const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hitherCaptureChooser',Object.freeze({choose:index=>{if(Number.isInteger(index))ipcRenderer.send('hither:screen-source-picked',index);}}));
