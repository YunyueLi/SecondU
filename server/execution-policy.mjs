import path from 'node:path';
import {realpathSync} from 'node:fs';
import {HttpError} from './store.mjs';
import {isAuthoredUSDemoProject} from './demo-us.mjs';

export function resolveExecutionPolicy(policy,profile){
  if(policy===undefined)return undefined; // Explicitly injected test fixtures retain the local demo engine.
  if(policy==='auto')return profile.demo?'showcase':'personal';
  if(!['showcase','personal'].includes(policy))throw new TypeError('Unknown execution policy');
  return policy;
}
export function assertTaskExecution(policy,task){
  if(policy==='showcase')throw new HttpError(403,'当前为示例模式。可以调整内容与配置，实际执行请进入个人空间。','showcase_read_only');
  if(policy==='personal'&&task.mode!=='live')throw new HttpError(409,'这是一条历史示例记录，仅供查看。请新建真实任务。','historical_demo_read_only');
}
function authoredExampleProject(store,key){
  if(isAuthoredUSDemoProject(store,key))return true;
  const report=store.get('meta','demo-showcase-v1')?.value,project=store.get('projects',key);
  if(!report?.root||!project?.path||!report.records?.some(record=>record.collection==='projects'&&record.id===key))return false;
  try{const root=realpathSync(report.root),directory=realpathSync(project.path),relative=path.relative(root,directory);return root===report.root&&relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}catch{return false;}
}
export function guardExecutionRoute(policy,{resource,key,action,operation,method,body},store){
  if(!policy)return;
  const mutate=!['GET','HEAD'].includes(method);
  if(policy==='showcase'){
    const execution=resource==='tasks'&&['run','message','approval'].includes(action)||resource==='agent-rooms'&&['messages','tasks'].includes(action)||resource==='automations'&&action==='run';
    const external=resource==='computers'&&mutate||resource==='delegations'&&mutate||resource==='connectors'&&(action==='test'||action==='oauth'&&['start','refresh','revoke'].includes(operation))||resource==='agent-resources'&&action==='probe'||resource==='im-connections'&&['probe','preview','commit'].includes(action)||resource==='im-outbox'&&['prepare','send'].includes(action)||resource==='model-connections'&&action==='test'||resource==='settings'&&key==='provider'&&action==='test';
    const localFiles=resource==='projects'&&(key==='choose-directory'||action==='files'&&!authoredExampleProject(store,key));
    const realMode=mutate&&['tasks','agent-rooms','automations'].includes(resource)&&body.mode==='live';
    const schedule=resource==='automations'&&mutate&&body.enabled===true;
    const modelConfiguration=resource==='model-connections'&&!action||resource==='settings'&&key==='provider'&&!action;
    const credentials=mutate&&!modelConfiguration&&(body.apiKey||body.token||body.clientSecret||body.oauth?.clientSecret);
    if(execution||external||localFiles||realMode||schedule||credentials)throw new HttpError(403,'当前为示例模式。配置已可编辑，实际执行或连接账户请进入个人空间。','showcase_read_only');
    return;
  }
  if(!mutate)return;
  if(resource==='tasks'){
    if(!key&&method==='POST'){if(body.mode===undefined)body.mode='live';if(body.mode!=='live')throw new HttpError(400,'真实空间只支持真实任务。','personal_live_only');}
    if(key&&['run','message','approval','feedback','reaction'].includes(action))assertTaskExecution(policy,store.require('tasks',key));
    if(key&&method==='PUT'&&Object.hasOwn(body,'mode')){const task=store.require('tasks',key);if(task.mode!=='live'||body.mode!=='live')throw new HttpError(409,'历史示例记录仅供查看，不能转换为真实执行。请新建任务。','historical_demo_read_only');}
  }
  if(resource==='agent-rooms'){
    if(!key&&method==='POST'){if(body.mode===undefined)body.mode='live';if(body.mode!=='live')throw new HttpError(400,'真实空间只支持真实会话。','personal_live_only');}
    if(key&&['messages','tasks'].includes(action))assertTaskExecution(policy,store.require('agentRooms',key));
    if(key&&method==='PUT'&&Object.hasOwn(body,'mode')){const room=store.require('agentRooms',key);if(room.mode!=='live'||body.mode!=='live')throw new HttpError(409,'历史示例会话仅供查看，请新建真实会话。','historical_demo_read_only');}
  }
  if(resource==='artifacts'&&['POST','PUT'].includes(method)){const taskId=key?store.require('artifacts',key).taskId:body.taskId;assertTaskExecution(policy,store.require('tasks',taskId));}
  if(resource==='automations'){
    if(!key&&method==='POST'){if(body.mode===undefined)body.mode='live';if(body.mode!=='live')throw new HttpError(400,'真实空间的自动化只支持真实任务。','personal_live_only');}
    if(key&&action==='run')assertTaskExecution(policy,store.require('automations',key));
    if(key&&method==='PUT'&&(body.enabled===true||Object.hasOwn(body,'mode'))){const automation=store.require('automations',key);if(automation.mode!=='live'||body.mode&&body.mode!=='live')throw new HttpError(409,'历史示例自动化仅供查看，请新建真实自动化。','historical_demo_read_only');}
  }
}
