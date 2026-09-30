import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../server/store.mjs';
import {ImCliService,runImCli} from '../server/im-cli.mjs';
import {createApp} from '../server/index.mjs';
import {commitChatImport} from '../server/imports.mjs';
const config={adapter:'hither-cli',command:'/fixture/messaging',channel:'slack',platform:'slack',accountId:'fixture-account',target:'channel:fixture',name:'虚构消息验收'};
const readData=()=>({format:'hither.chat.v1',platform:'slack',accountId:'fixture-account',people:[{id:'friend',name:'虚构联系人'}],conversations:[{id:'channel:fixture',title:'虚构消息验收',participantIds:['friend'],messages:[{id:'message-1',senderId:'friend',text:'原始中文，保留标点。',time:'2026-09-30T04:00:00Z'}]}]});
const receipt=input=>({protocol:'hither.im.v1',accepted:true,channel:input.channel,accountId:input.accountId,target:input.target,requestId:input.requestId,receipt:{messageId:'fixture-receipt'}});
async function bridge(_command,_args,input){
  if(input.action==='probe')return {protocol:'hither.im.v1',channel:input.channel,accountId:input.accountId,connected:true,capabilities:{read:true,send:true}};
  if(input.action==='read')return {protocol:'hither.im.v1',data:readData()};
  return receipt(input);
}
function fixture(t,runCli=bridge){const directory=mkdtempSync(path.join(os.tmpdir(),'hither-im-'));const store=new Store(directory,{seed:false});const im=new ImCliService(store,{runCli});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {store,im,directory};}
async function ready(im,body=config){const connection=im.save(body);return im.probe(connection.id);}
async function confirmation(im,key,text='仅限本机模拟的草稿'){const draft=im.draft(key,{text});const review=im.prepare(draft.id);return {draft,body:{...review.confirmation,confirmed:true}};}

test('CLI subprocess preserves split UTF-8 and treats text as data without shell execution',async t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'hither-im-exec-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const script=path.join(directory,'fixture.cjs');writeFileSync(script,`const b=Buffer.from(JSON.stringify({text:'你好，原文'}));const i=b.indexOf(Buffer.from('你'));process.stdout.write(b.subarray(0,i+1));setTimeout(()=>process.stdout.write(b.subarray(i+1)),20);`);
 assert.deepEqual(await runImCli(process.execPath,[script]),{text:'你好，原文'});
 const echo=path.join(directory,'echo.cjs');writeFileSync(echo,"let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(s));");
 assert.deepEqual(await runImCli(process.execPath,[echo],{text:'$(touch /not-created) `not-a-command`'}),{text:'$(touch /not-created) `not-a-command`'});
 const stall=path.join(directory,'stall.cjs');writeFileSync(stall,'setInterval(()=>{},1000)');
 await assert.rejects(runImCli(process.execPath,[stall],undefined,{timeout:25}),error=>error.code==='im_timeout');
 const noise=path.join(directory,'noise.cjs');writeFileSync(noise,"process.stdout.write('x'.repeat(2000))");
 await assert.rejects(runImCli(process.execPath,[noise],undefined,{maxBytes:100}),error=>error.code==='im_output_limit');
});

test('read preview does not import; confirmation preserves originals, provenance and deduplicates',async t=>{
 const {im,store,directory}=fixture(t);const c=await ready(im);assert.equal(c.canRead,true);
 const preview=await im.preview(c.id);assert.equal(store.list('conversations').length,0);
 assert.throws(()=>commitChatImport(store,preview.previewId),error=>error.code==='im_preview_binding');
 const result=im.commit(c.id,preview.previewId);const chat=store.require('conversations',result.conversationIds[0]);
 assert.equal(chat.messages[0].content,'原始中文，保留标点。');assert.equal(store.require('sources',result.sourceId).import.origin.kind,'im-cli');assert.match(store.require('sources',result.sourceId).title,/通信工具读取/);
 assert.equal(im.commit(c.id,(await im.preview(c.id)).previewId).added.messages,0);
 const other=new Store(directory,{seed:false});t.after(()=>other.close());assert.equal(other.require('conversations',chat.id).messages.length,1);assert.equal(other.require('imConnections',c.id).conversationId,chat.id);
});

test('foreign account/target output and message conflicts never alter imported history',async t=>{
 let data=readData();const {im,store}=fixture(t,async(...args)=>args[2].action==='read'?{protocol:'hither.im.v1',data}:bridge(...args));const c=await ready(im);
 data.accountId='another-account';await assert.rejects(im.preview(c.id),/账号/);assert.equal(store.list('sources').length,0);
 data=readData();const first=im.commit(c.id,(await im.preview(c.id)).previewId);data.conversations[0].messages[0].text='changed';
 await assert.rejects(im.preview(c.id),error=>error.status===409);assert.equal(store.require('conversations',first.conversationIds[0]).messages[0].content,'原始中文，保留标点。');
});

test('exact review required; duplicate/concurrent send cannot dispatch twice, including second DB instance',async t=>{
 let calls=0,release;const waiting=new Promise(resolve=>release=resolve);
 const run=async(...args)=>{if(args[2].action!=='send')return bridge(...args);calls++;await waiting;return receipt(args[2]);};
 const {im,directory}=fixture(t,run),c=await ready(im);const {draft,body}=await confirmation(im,c.id);
 await assert.rejects(im.send(draft.id,{...body,token:'wrong'}),error=>error.status===409);assert.equal(calls,0);
 const otherStore=new Store(directory,{seed:false}),other=new ImCliService(otherStore,{runCli:run});t.after(()=>otherStore.close());
 const pending=im.send(draft.id,body);await assert.rejects(other.send(draft.id,body),error=>error.status===409);assert.equal(calls,1);release();assert.equal((await pending).status,'accepted');
 await assert.rejects(im.send(draft.id,body),error=>error.status===409);assert.equal(calls,1);
});

test('configuration changes invalidate drafts/previews and stale asynchronous checks',async t=>{
 const {im,store}=fixture(t);const c=await ready(im),preview=await im.preview(c.id),{draft,body}=await confirmation(im,c.id);
 const updated=im.save({...config,revision:c.revision,target:'channel:changed'},store.require('imConnections',c.id));assert.equal(updated.status,'untested');
 await assert.rejects(im.send(draft.id,body),/配置已经改变/);assert.throws(()=>im.commit(c.id,preview.previewId),/连接配置已改变/);
 let release;im.runCli=async()=>new Promise(resolve=>release=resolve);const probe=im.probe(c.id);im.save({...config,revision:updated.revision},updated);release({protocol:'hither.im.v1',channel:'slack',accountId:'fixture-account',connected:true,capabilities:{read:true,send:true}});
 await assert.rejects(probe,/检查期间已修改/);assert.equal(store.require('imConnections',c.id).canSend,false);
});

test('uncertain and mismatched receipts stay unknown with no automatic retries',async t=>{
 for(const mode of ['timeout','channel','request','no-receipt']){
  let calls=0;const {im,store}=fixture(t,async(...args)=>{if(args[2].action!=='send')return bridge(...args);calls++;if(mode==='timeout')throw new Error('network after submission');const result=receipt(args[2]);if(mode==='channel')result.channel='discord';if(mode==='request')result.requestId='different';if(mode==='no-receipt')delete result.receipt;return result;});
  const c=await ready(im),{draft,body}=await confirmation(im,c.id);assert.equal((await im.send(draft.id,body)).status,'unknown');assert.equal(calls,1);assert.throws(()=>im.prepare(draft.id),/不能重复发送/);
  const second=new ImCliService(store,{runCli:bridge});assert.equal(second.drafts(c.id)[0].status,'unknown');assert.equal(calls,1);
 }
});

test('OpenClaw schema adaptation is explicit; config-only status cannot claim online',async t=>{
 let status={channelAccounts:{slack:[{accountId:'fixture-account',configured:true}]}};
 const {im,store}=fixture(t,async(_cmd,args)=>{
  assert.equal(args.includes('--account')||args[0]==='channels',true);
  if(args[0]==='channels')return status;
  if(args[1]==='read')return {action:'read',channel:'slack',payload:{messages:[{ts:'1790740800.001',user:'U1',text:'Slack 原文',channel:'fixture'}]}};
  return {action:'send',channel:'slack',dryRun:false,payload:{ok:true,result:{messageId:'slack-receipt'}}};
 });
 const c=im.save({...config,adapter:'openclaw',command:'openclaw'});assert.equal((await im.probe(c.id)).status,'unavailable');
 status.channelAccounts.slack[0].probe={ok:true};assert.equal((await im.probe(c.id)).canRead,true);const imported=im.commit(c.id,(await im.preview(c.id)).previewId);assert.equal(store.require('conversations',imported.conversationIds[0]).messages[0].content,'Slack 原文');
 const {draft,body}=await confirmation(im,c.id);assert.equal((await im.send(draft.id,body)).status,'accepted');
});

test('HTTP routes expose connections and outbox only in their local space',async t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'hither-im-api-'));const app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false},runImCli:bridge});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${app.server.address().port}/api`;const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const c=(await post('/im-connections',config)).data;assert.equal((await post(`/im-connections/${c.id}/probe`,{})).data.canRead,true);
 const p=(await post(`/im-connections/${c.id}/preview`,{})).data;assert.equal((await post(`/im-connections/${c.id}/commit`,{previewId:p.previewId})).data.added.messages,1);
 assert.equal((await fetch(base+'/im-connections',{headers:{Origin:'https://foreign.invalid'}})).status,403);
 const outbox=await(await fetch(base+'/im-outbox')).json();assert.deepEqual(outbox,[]);
});

test('Telegram negative numeric chat targets remain data, not command options',async t=>{
 let sentArgs;const {im}=fixture(t,async(_cmd,args)=>{if(args[0]==='channels')return {channelAccounts:{telegram:[{accountId:'fixture-account',probe:{ok:true}}]}};sentArgs=args;return {action:'send',channel:'telegram',payload:{messageId:'tg-receipt'}};});
 const c=await ready(im,{...config,adapter:'openclaw',command:'openclaw',channel:'telegram',target:'-100123456'});const {draft,body}=await confirmation(im,c.id,'--still ordinary text');assert.equal((await im.send(draft.id,body)).status,'accepted');assert.ok(sentArgs.includes('--target=-100123456'));assert.ok(sentArgs.includes('--message=--still ordinary text'));
});
