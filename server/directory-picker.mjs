import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {HttpError} from './store.mjs';

// These scripts are fixed strings. Request fields, folder names and paths are
// never interpolated into commands. Selection alone neither reads nor imports files.
const appleScript = 'try\nset chosenFolder to choose folder with prompt "选择项目文件夹 / Choose a project folder"\nreturn POSIX path of chosenFolder\non error number -128\nreturn ""\nend try';
const powershell = '$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $picker=New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description="Choose a project folder"; $picker.ShowNewFolderButton=$false; try { if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($picker.SelectedPath) } } finally { $picker.Dispose() }';

export function createDirectoryChooser({platform=process.platform,run=promisify(execFile)}={}) {
  let active=false;
  return async function chooseDirectory({signal}={}) {
    if(active)throw new HttpError(409,'已有文件夹选择窗口，请先完成或取消。','directory_picker_busy');
    const command=platform==='darwin'?['/usr/bin/osascript',['-e',appleScript]]:platform==='win32'?['powershell.exe',['-NoLogo','-NoProfile','-STA','-Command',powershell]]:platform==='linux'?['zenity',['--file-selection','--directory','--title=Choose a project folder']]:undefined;
    if(!command)throw new HttpError(501,'当前系统没有可用的文件夹选择器，请手动输入绝对路径。','directory_picker_unavailable');
    active=true;
    try {
      const {stdout}=await run(command[0],command[1],{encoding:'utf8',maxBuffer:65536,timeout:120000,windowsHide:true,signal});
      const selected=stdout.replace(/\r?\n$/,'');
      return selected||null;
    } catch(error) {
      // Zenity's documented cancel exit is 1. A diagnostic (for example no
      // display server) is a failure, not a successful user cancellation.
      if(platform==='linux'&&error.code===1&&!String(error.stderr??'').trim())return null;
      if(error.code==='ENOENT')throw new HttpError(501,'当前系统没有可用的文件夹选择器，请手动输入绝对路径。','directory_picker_unavailable');
      if(error.name==='AbortError'||signal?.aborted)throw new HttpError(499,'文件夹选择已取消。','directory_picker_cancelled');
      if(error.killed)throw new HttpError(408,'文件夹选择已超时，请重新选择。','directory_picker_timeout');
      throw new HttpError(503,'无法打开系统文件夹选择器，请重试或手动输入路径。','directory_picker_failed');
    } finally {active=false;}
  };
}

export const chooseProjectDirectory=createDirectoryChooser();
