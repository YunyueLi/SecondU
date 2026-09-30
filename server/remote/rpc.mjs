import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL, fail, identifier, ownerDirectory, workspaceDirectory, stamp, atomic, readJson, terminal, digest, stdinJson, clean, readWorkspaceFile, validateStart, readRunState, plainObject } from './common.mjs';
import { acquireWorkspace, releaseWorkspace } from './locking.mjs';

export async function handleRemoteRequest(request) {
  plainObject(request,['version','ownerId','runId','op','input']);
  if(request?.version!==PROTOCOL)throw fail('远端运行协议版本不一致，请重新准备运行组件。','remote_protocol_mismatch',409);
  const owner=ownerDirectory(request.ownerId),runId=identifier(request.runId),directory=path.join(owner,runId),input=request.input??{};
  if(request.op==='start') {
    const validated=validateStart(input,owner),signature=digest(JSON.stringify({...validated,apiKey:undefined}));
    if(existsSync(directory)){if(!existsSync(path.join(directory,'state.json')))throw fail('任务启动状态尚未写完，请恢复查询。','remote_start_pending',409);const state=readRunState(directory);if(state.signature!==signature)throw fail('相同任务标识的启动内容已变化，未重跑。','remote_run_conflict',409);return {state};}
    acquireWorkspace(validated.workspace,{ownerId:request.ownerId,runId,directory});
    const state={id:runId,ownerId:request.ownerId,status:'starting',workspace:validated.workspace,signature,createdAt:stamp(),updatedAt:stamp(),sequence:0,eventBytes:0,approvals:[],files:[],filesTruncated:false,cancelRequested:false};
    try{mkdirSync(directory,{mode:0o700});atomic(path.join(directory,'state.json'),state);}catch(e){if(e.code==='EEXIST')throw fail('任务正在启动，请恢复查询。','remote_start_pending',409);releaseWorkspace(validated.workspace,{ownerId:request.ownerId,runId});throw e;}
    const env=Object.fromEntries(['HOME','PATH','LANG','LC_ALL','TMPDIR'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
    const child=spawn(process.execPath,[fileURLToPath(new URL('./worker.mjs',import.meta.url)),directory],{detached:true,stdio:['pipe','ignore','ignore','ipc'],env});
    state.pid=child.pid;atomic(path.join(directory,'state.json'),state);
    let finish;
    const ready=new Promise(resolve=>{finish=resolve;});
    const timeout=setTimeout(()=>finish(),4000);
    child.once('message',()=>finish());child.once('error',error=>{state.status='failed';state.finishedAt=stamp();state.error={code:'remote_spawn_failed',message:clean(error.message,validated.apiKey)};atomic(path.join(directory,'state.json'),state);releaseWorkspace(validated.workspace,{ownerId:request.ownerId,runId});finish();});
    child.once('exit',()=>{const latest=readRunState(directory);if(latest.status==='starting'){latest.status='failed';latest.finishedAt=stamp();latest.updatedAt=stamp();latest.error={code:'remote_spawn_failed',message:'远端任务进程在初始化完成前退出，未自动重跑。'};atomic(path.join(directory,'state.json'),latest);releaseWorkspace(validated.workspace,{ownerId:request.ownerId,runId});}finish();});
    child.stdin.on('error',()=>finish());
    child.stdin.end(JSON.stringify(validated));
    await ready;clearTimeout(timeout);
    if(child.connected)child.disconnect();child.unref();
    return {state:readRunState(directory)};
  }
  if(!existsSync(path.join(directory,'state.json')))throw fail('当前空间没有这个远端任务。','remote_run_not_found',404);
  const state=readRunState(directory);
  if(terminal(state.status)&&!state.executorUnconfirmed)releaseWorkspace(state.workspace,{ownerId:request.ownerId,runId});
  if(request.op==='poll') {
    plainObject(input,['cursor']);
    const cursor=input.cursor??0;
    if(!Number.isSafeInteger(cursor)||cursor<0)throw fail('操作记录位置无效。');
    const file=path.join(directory,'events.jsonl'),content=existsSync(file)?readFileSync(file,'utf8'):'';
    const lines=content.split('\n').slice(0,-1),all=lines.map(line=>JSON.parse(line)).filter(row=>row.sequence>cursor),events=all.slice(0,200);
    return {state,events,cursor:events.at(-1)?.sequence??cursor,hasMore:all.length>events.length};
  }
  if(request.op==='approval') {
    plainObject(input,['approvalId','decision']);
    if(!['approve','reject'].includes(input.decision)||typeof input.approvalId!=='string')throw fail('审批决定无效。');
    const decisionFile=path.join(directory,`decision-${digest(input.approvalId)}.json`);
    if(existsSync(decisionFile)){const prior=readJson(decisionFile);if(prior.decision!==input.decision)throw fail('本次操作已有其他审批决定。','remote_approval_conflict',409);return {state,accepted:true};}
    if(terminal(state.status)||!state.approvals.some(item=>item.id===input.approvalId))throw fail('这条审批已失效，请刷新操作记录。','remote_approval_stale',409);
    try{writeFileSync(decisionFile,JSON.stringify({...input,at:stamp()}),{mode:0o600,flag:'wx'});}catch(e){if(e.code==='EEXIST')throw fail('本次审批正在处理，请重新查询。','remote_approval_conflict',409);throw e;}
    return {state,accepted:true};
  }
  if(request.op==='cancel') {
    plainObject(input,[]);
    if(!terminal(state.status)){const file=path.join(directory,'cancel.json');if(!existsSync(file))try{writeFileSync(file,JSON.stringify({at:stamp()}),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
    return {state,cancelRequested:!terminal(state.status)};
  }
  if(request.op==='file') {
    plainObject(input,['path','sha256']);
    const expected=state.files.find(file=>file.path===input.path);
    if(!expected)throw fail('这个文件不在本次任务产物清单中。','remote_file_not_found',404);
    if(input.sha256!==expected.sha256)throw fail('产物版本已变化，请刷新文件清单。','remote_file_changed',409);
    const file=readWorkspaceFile(workspaceDirectory(state.workspace,owner),input.path);
    if(file.size!==expected.size||file.sha256!==expected.sha256)throw fail('远端文件已被修改，与本次任务记录不一致。','remote_file_changed',409);
    return file;
  }
  throw fail('不支持的远端操作。','remote_operation_unsupported',404);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let request;
  try{request=await stdinJson();const result=await handleRemoteRequest(request);process.stdout.write(JSON.stringify({ok:true,result}));}
  catch(error){process.stdout.write(JSON.stringify({ok:false,error:{code:error.code??'remote_operation_failed',message:clean(error.message,request?.input?.apiKey).slice(0,4000),status:error.status??500}}));process.exitCode=1;}
}
