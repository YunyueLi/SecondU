import { accessSync, constants, lstatSync, realpathSync, opendirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { visibleWorkspaceEntry } from './workspace-files.mjs';
const fail=(status,message,code='invalid_project')=>{throw Object.assign(new Error(message),{status,code});};
const field=(value,name,max,optional=false)=>{if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))fail(400,`${name} 无效`);return value.trim();};
export function resolveProjectDirectory(value) {
  if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0'))fail(400,'请选择本机上的绝对目录路径。','invalid_project_path');
  try {const directory=realpathSync(value);if(!lstatSync(directory).isDirectory())fail(400,'项目位置必须是目录。','invalid_project_path');accessSync(directory,constants.R_OK|constants.X_OK);return directory;}
  catch(error){if(error.code==='invalid_project_path')throw error;fail(400,'项目目录不存在或当前电脑无法读取，请重新选择。','invalid_project_path');}
}
const overlapsData=(directory,data)=>directory===data||directory.startsWith(data+path.sep)||data.startsWith(directory+path.sep);
export function publicProject(project,dataDirectory) {
  let execution={status:'ready'};
  if(project.archived)execution={status:'unavailable',reason:'项目已归档，请恢复后再执行。'};
  else if(project.kind==='remote')execution={status:'unavailable',reason:'这是远端资料链接；当前未连接远端执行器，无法在此位置运行任务。可在本机检出后新建本地项目。'};
  else if(typeof dataDirectory==='string'&&overlapsData(project.path,dataDirectory))execution={status:'unavailable',reason:'项目目录不能与 Hither 的数据和密钥目录重叠，请选择独立项目目录。'};
  else {try{if(resolveProjectDirectory(project.path)!==project.path)execution={status:'unavailable',reason:'目录位置已改变，请重新绑定项目。'};}catch{execution={status:'unavailable',reason:'项目目录不可读取，请确认磁盘已连接且目录仍存在。'};}}
  return {...project,execution};
}
export function runnableProject(store,projectId) {
  const project=store.require('projects',projectId);
  const value=publicProject(project,store.protectedDataDirectory??store.directory);if(value.execution.status!=='ready')fail(409,value.execution.reason,'project_unavailable');
  return value;
}
export function projectReference(store,value,{runnable=false}={}) {
  if(value===undefined||value===null||value==='')return undefined;
  const id=field(value,'projectId',200),project=store.require('projects',id);
  if(project.archived)fail(409,'项目已归档，请恢复后再关联。','project_unavailable');
  if(runnable)runnableProject(store,id);
  return id;
}
export function createProject(store,body,existing) {
  const value={...existing,...body},stamp=new Date().toISOString(),kind=value.kind??'local';
  if(!['local','remote'].includes(kind))fail(400,'项目位置类型无效。');
  if(value.archived!==undefined&&typeof value.archived!=='boolean')fail(400,'archived 必须为布尔值。');
  const project={id:existing?.id??`project-${randomUUID()}`,name:field(value.name,'name',100),kind,description:field(value.description??'','description',3000,true),archived:value.archived??false,createdAt:existing?.createdAt??stamp,updatedAt:stamp};
  if(kind==='local')project.path=existing?.kind==='local'&&value.path===existing.path?existing.path:resolveProjectDirectory(value.path);
  else {const raw=field(value.url,'url',2000);let url;try{url=new URL(raw);}catch{fail(400,'远端项目请填写完整的 HTTPS、SSH 或 Git 链接。');}if(!['https:','http:','ssh:','git:'].includes(url.protocol)||url.password||url.search||url.hash||(url.protocol!=='ssh:'&&url.username))fail(400,'远端链接不能携带凭据、查询参数或片段。');project.url=url.href;}
  const referenced=existing&&(store.list('tasks').some(task=>task.projectId===existing.id)||store.list('agentRooms').some(room=>room.projectId===existing.id));
  if(referenced&&(project.kind!==existing.kind||project.path!==existing.path||project.url!==existing.url))fail(409,'这个项目已关联对话或任务。请新建项目来绑定其他位置，保留原文件与历史任务的对应关系。','project_in_use');
  if(kind==='local'&&overlapsData(project.path,store.protectedDataDirectory??store.directory))fail(400,'项目目录不能与 Hither 的数据和密钥目录重叠，请选择独立项目目录。','invalid_project_path');
  return project;
}


export function listProjectFiles(store,projectId,relative='') {
  const project=runnableProject(store,projectId),parts=relative?relative.split('/'):[];
  if(parts.some(part=>!part||part==='.'||part==='..'||part.includes('\\')||!visibleWorkspaceEntry(part))||path.isAbsolute(relative))fail(400,'只允许浏览项目内的普通相对目录。','invalid_project_path');
  let directory=project.path;
  for(const part of parts){directory=path.join(directory,part);let stat;try{stat=lstatSync(directory);}catch{fail(404,'项目目录不存在。');}if(stat.isSymbolicLink()||!stat.isDirectory())fail(400,'不能浏览链接或非目录路径。','invalid_project_path');}
  const entries=[];let truncated=false,visited=0,handle;
  try {
    handle=opendirSync(directory);let entry;
    while((entry=handle.readSync())){
      if(++visited>4000){truncated=true;break;}
      if(entry.isSymbolicLink()||!visibleWorkspaceEntry(entry.name)||(!entry.isFile()&&!entry.isDirectory()))continue;
      if(entries.length>=200){truncated=true;break;}
      const file=path.join(directory,entry.name);let stat;try{stat=lstatSync(file);}catch{continue;}if(stat.isSymbolicLink())continue;
      entries.push({name:entry.name,path:relative?`${relative}/${entry.name}`:entry.name,kind:entry.isDirectory()?'directory':'file',...(entry.isFile()?{size:stat.size}:{}),modifiedAt:stat.mtime.toISOString()});
    }
  }catch{fail(400,'当前目录无法读取。','invalid_project_path');}
  finally{handle?.closeSync();}
  entries.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='directory'?-1:1);
  return {projectId,path:relative,entries,truncated,limit:200};
}
