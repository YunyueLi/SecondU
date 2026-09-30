import {accessSync,constants,mkdtempSync,mkdirSync,writeFileSync,readFileSync,lstatSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {HttpError} from './http-error.mjs';
import {artifactBytes,encodeBinaryArtifact,BINARY_ARTIFACT_LIMIT} from './artifact-content.mjs';
import {officeType,validateOfficeArchive} from './office-content.mjs';

const unavailable=()=>new HttpError(503,'本机未找到 LibreOffice，暂不能预览此 Office 文件；仍可下载原文件。','office_preview_unavailable');
const failed=()=>new HttpError(422,'本机未能转换这份 Office 文件，请下载原文件查看。','office_preview_failed');
let running=0;
export function findOfficeBinary(){
 const names=process.platform==='win32'?['soffice.exe','libreoffice.exe']:['libreoffice','soffice'];
 const candidates=[...(process.platform==='darwin'?['/Applications/LibreOffice.app/Contents/MacOS/soffice']:[]),...(process.platform==='win32'?[process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean).map(dir=>path.join(dir,'LibreOffice','program','soffice.exe')):[]),...(process.env.PATH??'').split(path.delimiter).filter(Boolean).flatMap(dir=>names.map(name=>path.join(dir,name)))];
 for(const candidate of candidates)try{accessSync(candidate,constants.X_OK);if(lstatSync(candidate).isFile()||lstatSync(candidate).isSymbolicLink())return candidate;}catch{}
 return undefined;
}
export const OFFICE_PROFILE=`<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop><prop oor:name="DisableActiveContent" oor:op="fuse"><value>true</value></prop><prop oor:name="DisablePythonRuntime" oor:op="fuse"><value>true</value></prop><prop oor:name="DisableOLEAutomation" oor:op="fuse"><value>true</value></prop></item></oor:items>`;
export async function convertWithLibreOffice({binary,input,outputDir,profileDir,timeoutMs}){
 const filter={'.docx':'writer_pdf_Export','.xlsx':'calc_pdf_Export','.pptx':'impress_pdf_Export'}[path.extname(input)];
 const home=path.dirname(profileDir),env={PATH:process.env.PATH??'',HOME:home,USERPROFILE:home,TMPDIR:home,TMP:home,TEMP:home,LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8',SAL_USE_VCLPLUGIN:'svp',...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'',WINDIR:process.env.WINDIR??''}:{})};
 await new Promise((resolve,reject)=>{
  let child,settled=false,timedOut=false,stopped=false;
  const stop=()=>{if(!child?.pid||stopped)return;stopped=true;try{if(process.platform==='win32'){spawnSync(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:2000});child.kill('SIGKILL');}else process.kill(-child.pid,'SIGKILL');}catch{}};
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve();};
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);timer.unref();
  try{child=spawn(binary,[`-env:UserInstallation=${pathToFileURL(profileDir).href}`,'--headless','--invisible','--nologo','--nodefault','--norestore','--nolockcheck','--convert-to',`pdf:${filter}`,'--outdir',outputDir,input],{cwd:home,env,stdio:'ignore',detached:process.platform!=='win32',windowsHide:true});}
  catch{finish(failed());return;}
  child.once('error',()=>finish(failed()));
  child.once('exit',code=>{stop();finish(timedOut?new HttpError(504,'Office 本机转换超时，请下载原文件查看。','office_preview_timeout'):code===0?undefined:failed());});
 });
 const output=path.join(outputDir,'document.pdf');
 try{const stat=lstatSync(output);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>BINARY_ARTIFACT_LIMIT)throw failed();return readFileSync(output);}catch(error){if(error instanceof HttpError)throw error;throw failed();}
}

/** Cache is private to this exact store/space and contains generated PDF bytes only. */
export function createOfficePreviewer(store,{binary=findOfficeBinary,convert=convertWithLibreOffice,timeoutMs=20000}={}){
 const cache=new Map(),inFlight=new Map();let bytes=0;
 return async (artifactId,version)=>{
  const current=store.require('artifacts',artifactId);if(!officeType(current.name))throw new HttpError(400,'此产物不需要 Office 转换。','office_preview_type');
  let artifact=current;
  if(version!==undefined&&version!==null){if(!/^[1-9][0-9]*$/.test(String(version)))throw new HttpError(400,'产物版本无效。','invalid_artifact_version');const old=current.versions?.find(item=>item.version===Number(version));if(!old)throw new HttpError(404,'此版本不存在。','artifact_version_missing');artifact={name:current.name,...old};}
  const {data,mime}=artifactBytes(artifact);validateOfficeArchive(current.name,data,{preview:true});
  const key=createHash('sha256').update(mime).update('\0').update(data).digest('hex');
  if(cache.has(key)){const pdf=cache.get(key);cache.delete(key);cache.set(key,pdf);return pdf;}
  if(inFlight.has(key))return inFlight.get(key);
  const executable=typeof binary==='function'?binary():binary;if(!executable)throw unavailable();
  if(running>=2)throw new HttpError(503,'已有文件在本机转换，请稍后重试。','office_preview_busy');
  running++;
  const promise=(async()=>{
   let temporary;
   try{
    temporary=mkdtempSync(path.join(os.tmpdir(),'secondu-office-preview-'));const profileDir=path.join(temporary,'profile'),outputDir=path.join(temporary,'output'),input=path.join(temporary,'document'+path.extname(current.name).toLowerCase());
    mkdirSync(path.join(profileDir,'user'),{recursive:true,mode:0o700});mkdirSync(outputDir,{mode:0o700});writeFileSync(path.join(profileDir,'user','registrymodifications.xcu'),OFFICE_PROFILE,{mode:0o600});writeFileSync(input,data,{mode:0o600});
    const pdf=await convert({binary:executable,input,outputDir,profileDir,timeoutMs});encodeBinaryArtifact('preview.pdf',pdf);
    cache.set(key,pdf);bytes+=pdf.length;
    while(cache.size>8||bytes>24*1024*1024){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).length;cache.delete(oldest);}
    return pdf;
   }catch(error){if(error instanceof HttpError)throw error;throw failed();}
   finally{running--;if(temporary)rmSync(temporary,{recursive:true,force:true});}
  })();
  inFlight.set(key,promise);try{return await promise;}finally{inFlight.delete(key);}
 };
}
