import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {Store} from '../server/store.mjs';
import {ImCliService} from '../server/im-cli.mjs';
import {ImSetupService,OPENCLAW_RELEASE,runSetupCommand,qrOnly,compatibleNode} from '../server/im-setup.mjs';
function fixture(t,options={}){
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-im-setup-')),store=new Store(directory,{seed:false}),calls=[];
 const runCommand=async(command,args,opts={})=>{calls.push({command,args,opts});if(args[0]==='--version')return command==='node'?'v26.3.1':'OpenClaw 2026.9.7';if(args.includes('list'))return JSON.stringify({chat:{slack:{accounts:['default'],label:'Slack',installed:true},discord:{accounts:['default'],label:'Discord',installed:true},whatsapp:{accounts:[],installed:true},other:{accounts:[],installed:false}}});if(args.includes('status'))return JSON.stringify({channelAccounts:{slack:[{accountId:'default',configured:true,running:true,connected:true,token:'DO_NOT_RETURN'}],discord:[{accountId:'default',configured:true,probe:{ok:true}}]}});return 'ok';};
 const installer=async({directory,packages,version,versions,integrities})=>{let lock={packages:{}};try{lock=JSON.parse(readFileSync(path.join(directory,'package-lock.json'),'utf8'));}catch{}for(const name of packages){const folder=path.join(directory,'node_modules',name);mkdirSync(folder,{recursive:true});writeFileSync(path.join(folder,'package.json'),JSON.stringify({name,version:versions?.[name]??version}));lock.packages[`node_modules/${name}`]={version:versions?.[name]??version,integrity:integrities[name]};}writeFileSync(path.join(directory,'package-lock.json'),JSON.stringify(lock));};
 const im=new ImCliService(store,{runCli:async(command,args,input,opts)=>{calls.push({command,args,opts});if(args.includes('status'))return {channelAccounts:{slack:[{accountId:'default',configured:true,connected:true}]}};return {};}});
 const service=new ImSetupService(store,{im,executionPolicy:'personal',runCommand,installRuntime:installer,...options});
 t.after(async()=>{await service.close();store.close();rmSync(directory,{recursive:true,force:true});});return {service,im,store,calls,directory};
}
async function install(service,channel='slack'){const op=service.install({channel,confirmed:true});await service.operations.get(op.id).promise;assert.equal(service.operations.get(op.id).status,'completed');return op;}
const credentials={channel:'slack',accountId:'default',botToken:'xoxb-SYNTHETIC_SECRET_ONLY',appToken:'xapp-SYNTHETIC_SECRET_ONLY',confirmed:true};

test('Node compatibility is exact; CLI subprocess is bounded and cannot leak stderr',async t=>{
 for(const version of ['24.16.0','24.99.0','26.1.0','27.0.0'])assert.equal(compatibleNode(version),true);for(const version of ['22.18.0','24.15.0','25.9.0','26.0.0','bad'])assert.equal(compatibleNode(version),false);
 assert.equal(await runSetupCommand(process.execPath,['-e','process.stdout.write("ok")']), 'ok');
 await assert.rejects(runSetupCommand(process.execPath,['-e','process.stderr.write("SECRET");process.exit(1)']),error=>!error.message.includes('SECRET'));
 await assert.rejects(runSetupCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:20}),error=>error.code==='im_setup_timeout');
 const controller=new AbortController();const operation=runSetupCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});controller.abort();await assert.rejects(operation,error=>error.code==='im_setup_cancelled');
});

test('showcase status is descriptive and all process/configuration actions are denied',async t=>{
 const {service,calls,directory}=fixture(t,{executionPolicy:'showcase'});assert.equal((await service.handle({method:'GET'})).data.showcase,true);
 for(const key of ['detect','select','install','channels','probe','configure','login','gateway','connection'])await assert.rejects(service.handle({method:'POST',key,body:{...credentials}}),error=>error.code==='showcase_read_only');assert.equal(calls.length,0);assert.equal(service.managedInstalled(),false);
});

test('install is explicit, verifies locked official versions, and does not forward credentials into env',async t=>{
 const {service,calls}=fixture(t);assert.throws(()=>service.install({channel:'slack'}),error=>error.code==='im_setup_confirmation');assert.equal(calls.length,0);const op=await install(service);assert.equal(service.managedInstalled('slack'),true);assert.equal(service.managedInstalled('discord'),false);assert.equal(service.publicOperation(service.operations.get(op.id)).status,'completed');
 const runtime=await service.resolveRuntime('managed');assert.equal(runtime.command,'node');assert.match(runtime.options.env.OPENCLAW_STATE_DIR,/im\/openclaw\/state$/);assert.equal(runtime.options.env.OPENAI_API_KEY,undefined);assert.equal(runtime.options.env.OPENCLAW_CONFIG_PATH,path.join(service.statePath,'openclaw.json'));assert.equal(statSync(service.configPath).mode&0o777,0o600);
 assert.equal(calls.some(call=>call.args.includes('capabilities')),false); // That upstream command can auto-install plugins.
});

test('tampered installed version/integrity never becomes an enabled runtime',async t=>{
 const {service}=fixture(t,{installRuntime:async()=>{}});const op=service.install({channel:'slack',confirmed:true});await service.operations.get(op.id).promise;assert.equal(service.publicOperation(service.operations.get(op.id)).code,'im_setup_integrity');assert.equal(service.managedInstalled(),false);await assert.rejects(service.resolveRuntime('managed'),error=>error.code==='im_setup_install_required');
});

test('existing runtime detection and explicit checks never mutate its config or own its processes',async t=>{
 const {service,calls}=fixture(t);await service.detect();service.select({runtimeId:'existing'});const result=await service.channels();assert.equal(result.channels[0].channel,'slack');const probe=await service.probe({channel:'slack'});assert.equal(probe.connected,true);assert.equal(JSON.stringify(probe).includes('DO_NOT_RETURN'),false);
 await assert.rejects(service.configure(credentials),error=>error.code==='im_setup_existing_read_only');await assert.rejects(service.manageGateway({action:'start',confirmed:true}),error=>error.code==='im_setup_existing_read_only');assert.throws(()=>service.login({channel:'whatsapp',confirmed:true}),error=>error.code==='im_setup_existing_read_only');
 assert.equal(calls.filter(call=>!call.args.includes('--version')).every(call=>call.opts.env.OPENCLAW_CONFIG_READONLY==='1'),true);assert.equal(calls.some(call=>['add','install','logout','start','stop'].some(arg=>call.args.includes(arg))),false);
});

test('managed credentials stay in protected config; disable ambient replies and roll back failed validation',async t=>{
 const {service,store,calls}=fixture(t);await install(service);const result=await service.configure(credentials);assert.equal(result.automaticReplies,false);assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'),false);assert.equal(JSON.stringify(service.status()).includes('SYNTHETIC_SECRET'),false);assert.equal(JSON.stringify(store.list('meta')).includes('SYNTHETIC_SECRET'),false);assert.equal(JSON.stringify(calls.map(call=>call.args)).includes('SYNTHETIC_SECRET'),false);
 const saved=JSON.parse(readFileSync(service.configPath,'utf8'));assert.equal(saved.channels.slack.accounts.default.botToken,credentials.botToken);assert.equal(saved.channels.slack.dmPolicy,'disabled');assert.equal(saved.channels.slack.groupPolicy,'disabled');assert.equal(saved.channels.slack.accounts.default.dm.enabled,false);
 const before=readFileSync(service.configPath,'utf8');service.run=async()=>{throw new Error('secret detail');};await assert.rejects(service.configure({...credentials,botToken:'xoxb-NEW_SECRET'}));assert.equal(readFileSync(service.configPath,'utf8'),before);
});

test('connection is bound to runtime and exact account; generic existing preview workflow stays intact',async t=>{
 const {service,im,calls}=fixture(t);await install(service);await service.configure(credentials);const c=await service.connection({channel:'slack',accountId:'default',name:'Synthetic channel',target:'channel:fixture'});assert.equal(c.runtimeId,'managed');assert.equal(c.canRead,true);await im.call(c,'read');const last=calls.at(-1);assert.equal(last.command,'node');assert.equal(last.args.includes('--target=channel:fixture'),true);assert.equal(last.opts.env.OPENCLAW_CONFIG_PATH,service.configPath);
 await assert.rejects(service.connection({channel:'slack',accountId:'unverified',name:'Bad',target:'channel:other'}),error=>error.code==='im_setup_not_connected');assert.equal(im.list().length,1);
});

test('QR output accepts only matrix rows; cancellation and restart never imply login success',async t=>{
 const rows=Array.from({length:20},()=> '█ ▀▄'.repeat(12)).join('\n');assert.equal(qrOnly(`token=SECRET\nhttps://private.invalid\n${rows}`),rows);assert.equal(qrOnly('SECRET https://account.invalid'),undefined);
 const {service,store,im}=fixture(t);await install(service,'whatsapp');await service.configure({channel:'whatsapp',confirmed:true});service.run=async(command,args,options)=>{options.onOutput?.(`SECRET\n${rows}`);return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{code:'im_setup_cancelled'})),{once:true}));};
 const op=service.login({channel:'whatsapp',confirmed:true});await new Promise(resolve=>setTimeout(resolve,5));const publicOp=service.publicOperation(service.operations.get(op.id));assert.equal(publicOp.qr,rows);assert.equal(JSON.stringify(publicOp).includes('SECRET'),false);
 assert.throws(()=>service.select({runtimeId:'managed'}),error=>error.code==='im_setup_busy');const cancelled=await service.handle({method:'DELETE',key:'operations',action:op.id});assert.equal(cancelled.data.status,'cancelled');assert.equal(cancelled.data.qr,undefined);
 const restarted=new ImSetupService(store,{im,executionPolicy:'personal'});await assert.rejects(restarted.handle({method:'GET',key:'operations',action:op.id}),error=>error.code==='im_setup_operation_missing');await restarted.close();
});

test('only managed foreground process is stopped and its status is not an account connection claim',async t=>{
 let child,kills=[];const {service}=fixture(t,{spawnProcess:()=>{child=new EventEmitter();child.kill=signal=>{kills.push(signal);queueMicrotask(()=>child.emit('close',0));};queueMicrotask(()=>child.emit('spawn'));return child;}});await install(service);await service.configure(credentials);await service.manageGateway({action:'start',confirmed:true});await new Promise(resolve=>setTimeout(resolve,1));assert.equal(service.status().managed.gateway,'running');assert.equal(service.status().connected,undefined);await service.manageGateway({action:'stop',confirmed:true});assert.deepEqual(kills,['SIGTERM']);assert.equal(service.status().managed.gateway,'stopped');
});

test('thirteen official channel setup paths preserve their real authorization schemas',async t=>{
 const {IM_CHANNEL_CATALOG,managedChannelConfig}=await import('../server/im-catalog.mjs');
 assert.equal(IM_CHANNEL_CATALOG.length,13);const {IM_CHANNEL_LIMITATIONS}=await import('../server/im-catalog.mjs');assert.deepEqual(IM_CHANNEL_LIMITATIONS.map(item=>item.channel),['wechat','dingtalk']);assert.deepEqual(IM_CHANNEL_CATALOG.filter(channel=>channel.canRead).map(channel=>channel.channel),['slack','discord']);
 const examples={
  slack:{botToken:'xoxb-TEST_ONLY',appToken:'xapp-TEST_ONLY'},discord:{token:'TEST_ONLY'},telegram:{botToken:'123456:TEST_ONLY'},
  qqbot:{appId:'TEST_APP',clientSecret:'TEST_ONLY'},wecom:{botId:'TEST_BOT',secret:'TEST_ONLY'},feishu:{appId:'cli_TEST_ONLY',appSecret:'TEST_ONLY',domain:'lark'},whatsapp:{},
  msteams:{appId:'TEST_APP',appPassword:'TEST_ONLY',tenantId:'TEST_TENANT'},
  signal:{phoneNumber:'+15551234567',serviceUrl:'http://127.0.0.1:8080'},imessage:{cliPath:'/fixture/imsg'},
  matrix:{homeserver:'https://matrix.example.com',userId:'@fixture:example.com',accessToken:'TEST_ONLY'},
  mattermost:{baseUrl:'https://chat.example.com',botToken:'TEST_ONLY'},
  googlechat:{serviceAccount:JSON.stringify({type:'service_account',client_email:'fixture@fictional.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nSYNTHETIC_NOT_A_KEY\n-----END PRIVATE KEY-----',token_uri:'https://oauth2.googleapis.com/token'}),audience:'https://fictional.example/googlechat'}
 };
 const {service}=fixture(t);
 for(const channel of IM_CHANNEL_CATALOG){await install(service,channel.channel);const body={channel:channel.channel,accountId:'default',confirmed:true,...examples[channel.channel]};if(channel.channel==='imessage'&&process.platform!=='darwin'){await assert.rejects(service.configure(body),error=>error.code==='im_setup_invalid');assert.equal(managedChannelConfig('imessage',body,{platform:'darwin'}).entry.catchup.enabled,false);continue;}await service.configure(body);const config=JSON.parse(readFileSync(service.configPath,'utf8')),root=config.channels[channel.channel],account=channel.singleAccount||channel.defaultAtRoot?root:root.accounts.default;assert.equal(account.enabled,true);assert.equal(account.groupPolicy,'disabled');if(channel.channel==='matrix'){assert.equal(root.dm.enabled,false);assert.equal(account.autoJoin,'off');assert.equal(account.dmPolicy,undefined);}else assert.equal(account.dmPolicy,'disabled');assert.equal(JSON.stringify(service.status()).includes('TEST_ONLY'),false);}
 const config=JSON.parse(readFileSync(service.configPath,'utf8'));
 assert.equal(config.channels.feishu.accounts.default.domain,'lark');assert.equal(config.channels.feishu.accounts.default.connectionMode,'websocket');
 assert.equal(config.channels.signal.accounts.default.transport.kind,'external-native');assert.equal(config.channels.signal.accounts.default.transport.url,'http://127.0.0.1:8080');assert.equal(config.channels.signal.accounts.default.serviceUrl,undefined);
 assert.equal(config.channels.msteams.accounts,undefined);assert.equal(config.channels.msteams.authType,'secret');
 assert.equal(config.plugins.load.paths.some(value=>value.endsWith('@openclaw/telegram')),false);
 assert.throws(()=>managedChannelConfig('signal',{...examples.signal,serviceUrl:'https://outside.example'}),error=>error.code==='im_setup_invalid');
 assert.throws(()=>managedChannelConfig('feishu',{...examples.feishu,domain:'https://outside.example'}),error=>error.code==='im_setup_invalid');
 assert.throws(()=>managedChannelConfig('imessage',examples.imessage,{platform:'linux'}),error=>error.code==='im_setup_invalid');
 assert.throws(()=>managedChannelConfig('msteams',{...examples.msteams,accountId:'other'}),error=>error.code==='im_setup_invalid');
});

test('a failed protected config write releases the setup lock without rolling over the original',async t=>{
 const {service}=fixture(t);await install(service);const before=readFileSync(service.configPath,'utf8');const write=service.writeConfig;let calls=0;service.writeConfig=()=>{calls++;throw Object.assign(new Error('Synthetic read-only filesystem'),{code:'EROFS'});};
 await assert.rejects(service.configure(credentials),error=>error.code==='EROFS');assert.equal(service.mutating,false);assert.equal(calls,1);assert.equal(readFileSync(service.configPath,'utf8'),before);service.writeConfig=write;await service.configure(credentials);
});
