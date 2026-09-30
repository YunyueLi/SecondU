#!/usr/bin/env node
// Protocol-only fixture: never invokes a model, shell command, or network API.
import readline from 'node:readline';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
if(process.argv.includes('--version')){process.stdout.write('codex remote-fixture\n');process.exit(0);}
const cwd=process.cwd(),threadId='thread-fixture',turnId='turn-fixture';let prompt='',timer;
const configArgs=process.argv.filter((_,index)=>process.argv[index-1]==='-c');
assert.ok(configArgs.includes('approval_policy="on-request"'));
assert.ok(configArgs.includes('approvals_reviewer="user"'));
appendFileSync(path.join(cwd,'invocations.log'),'start\n');
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
const notify=(method,params)=>send({method,params:{threadId,turnId,...params}});
function complete(approved=true){
  if(approved)writeFileSync(path.join(cwd,'result.md'),'Synthetic remote result.\n');
  if(prompt.includes('SENSITIVE'))writeFileSync(path.join(cwd,'copied.txt'),process.env.HITHER_PROVIDER_API_KEY);
  const item={id:'answer',type:'agentMessage',phase:'final_answer',text:approved?'Synthetic task finished.':'Requested operation declined.'};
  notify('item/completed',{item});notify('turn/completed',{turn:{id:turnId,status:'completed',items:[item]}});
}
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{
  const row=JSON.parse(line);if(!row.method){if(row.id===91)complete(row.result?.decision==='accept');return;}
  const answer=result=>send({id:row.id,result});
  if(row.method==='initialize')answer({userAgent:'remote-fixture'});
  else if(row.method==='config/read')answer({config:{approval_policy:'on-request',approvals_reviewer:'user',default_permissions:'hither',permissions:{hither:{filesystem:{':minimal':'read',[cwd]:'write'},network:{enabled:false}}}}});
  else if(row.method==='thread/start'){
    assert.equal(row.params.approvalPolicy,'on-request');assert.equal(row.params.approvalsReviewer,'user');answer({thread:{id:threadId}});
  }
  else if(row.method==='turn/start'){
    assert.equal(row.params.approvalPolicy,'on-request');assert.equal(row.params.approvalsReviewer,'user');
    prompt=row.params.input.filter(item=>item.type==='text').map(item=>item.text).join('\n');answer({turn:{id:turnId}});notify('turn/started',{turn:{id:turnId}});
    if(prompt.includes('APPROVAL'))send({id:91,method:'item/commandExecution/requestApproval',params:{threadId,turnId,itemId:'command-fixture',command:'fixture-operation',cwd,reason:'Fixture needs a decision.'}});
    else if(!prompt.includes('WAIT'))timer=setTimeout(()=>complete(),prompt.includes('DELAY')?1800:50);
  }else if(row.method==='turn/interrupt'){clearTimeout(timer);answer({});}
});
lines.on('close',()=>{clearTimeout(timer);process.exit(0);});
