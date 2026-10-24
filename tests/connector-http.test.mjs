import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectorRpc,openConnectorSession} from '../server/connector-http.mjs';
import {saveConnector} from '../server/connectors.mjs';
import {Store} from '../server/store.mjs';

const fmp={kind:'mcp_http',name:'Synthetic FMP fixture',catalogId:'fmp',url:'https://financialmodelingprep.com/mcp',authMode:'bearer'};
const rpc={jsonrpc:'2.0',id:'fixture-request',method:'tools/list',params:{}};
const network={resolve:async()=>[{address:'8.8.8.8',family:4}]};

// Inspect the actual request boundary without transmitting a credential to a
// provider. This transport fixture is deliberately separate from local HTTP tests.
function captureHTTPS(t,{status=200,error=false}={}){
 const calls=[];
 t.mock.method(https,'request',(url,options,receive)=>{
  const req=new EventEmitter();req.destroy=()=>{};
  req.end=raw=>queueMicrotask(()=>{
   calls.push({url:new URL(url),options,message:JSON.parse(raw)});
   if(error){req.emit('error',new Error(`Synthetic upstream error ${url}`));return;}
   const res=new PassThrough();res.statusCode=status;res.headers={'content-type':'application/json',location:'https://untrusted.example/redirect'};
   receive(res);
   res.end(status===200?JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:{tools:[]}}):`Synthetic provider body ${url}`);
  });
  return req;
 });
 return calls;
}

test('FMP inserts its vault key only at the exact registered HTTPS request boundary',async t=>{
 const calls=captureHTTPS(t),token='synthetic-key +&/?=#中文';
 const result=await connectorRpc(fmp,token,rpc,network);
 assert.deepEqual(result.result,{tools:[]});assert.equal(calls.length,1);
 assert.equal(calls[0].url.origin+calls[0].url.pathname,fmp.url);
 assert.equal(calls[0].url.searchParams.get('apikey'),token);
 assert.deepEqual([...calls[0].url.searchParams.keys()],['apikey']);
 assert.equal(calls[0].options.headers.Authorization,undefined);
 assert.equal(fmp.url,'https://financialmodelingprep.com/mcp');
 assert.ok(!JSON.stringify(result).includes(token));
 let pinned;calls[0].options.lookup('financialmodelingprep.com',{all:true},(_err,addresses)=>{pinned=addresses;});
 assert.deepEqual(pinned,[{address:'8.8.8.8',family:4}]);
});

test('query authentication cannot be requested for an arbitrary endpoint or borrowed catalog identity',async t=>{
 const calls=captureHTTPS(t),token='synthetic-private-key';
 for(const config of [
  {...fmp,url:'https://financialmodelingprep.com/mcp/other'},
  {...fmp,url:'https://financialmodelingprep.com.evil.example/mcp'},
  {...fmp,catalogId:'github'},
  {...fmp,url:'https://example.com/mcp',catalogId:undefined,queryAuthKey:'apikey'},
 ])await connectorRpc(config,token,rpc,network);
 for(const call of calls){assert.equal(call.url.search,'');assert.equal(call.options.headers.Authorization,`Bearer ${token}`);}
 await assert.rejects(connectorRpc({...fmp,url:fmp.url+'?apikey=synthetic-query-secret'},token,rpc,network),{code:'invalid_connector_url'});
 await assert.rejects(connectorRpc(fmp,token,rpc,{resolve:async()=>[{address:'127.0.0.1',family:4}]}),{code:'connector_address_denied'});
 assert.equal(calls.length,4);
});

test('FMP refuses absent credentials and unsupported auth modes before dispatch',async t=>{
 const calls=captureHTTPS(t);
 for(const [config,token] of [[fmp,undefined],[fmp,''],[{...fmp,authMode:'none'},'synthetic'],[{...fmp,authMode:'oauth'},'synthetic']]){
  await assert.rejects(connectorRpc(config,token,rpc,network),{code:'connector_api_key_required'});
 }
 assert.equal(calls.length,0);
});

test('FMP query credentials remain outside saved configurations and public state',t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-mcp-key-')),store=new Store(directory,{seed:false}),token='synthetic-vault-only-key';
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const visible=saveConnector(store,{...fmp,token}),saved=store.require('connectors',visible.id);
 assert.equal(visible.hasToken,true);assert.equal(visible.status,'untested');assert.equal(visible.url,fmp.url);assert.equal(saved.url,fmp.url);
 assert.ok(!JSON.stringify([visible,saved]).includes(token));
 assert.equal(store.getKey({id:`connector:${visible.id}`,provider:'mcp_http',baseUrl:fmp.url}),token);
 assert.throws(()=>saveConnector(store,{...fmp,url:fmp.url+'?apikey='+token}),{code:'invalid_connector_url'});
});

test('FMP transport failures never leak the credential-bearing request URL or follow redirects',async t=>{
 for(const options of [{status:302},{status:401},{status:500},{error:true}]){
  await t.test(JSON.stringify(options),async t=>{
   const calls=captureHTTPS(t,options);
   await assert.rejects(connectorRpc(fmp,'synthetic-secret-in-request',rpc,network),error=>{
    assert.ok(['connector_http_error','connector_unreachable'].includes(error.code));
    assert.doesNotMatch(error.message,/synthetic-secret-in-request|apikey|Synthetic/);return true;
   });
   assert.equal(calls.length,1);
  });
 }
});

async function toolServer(t,list){
 let pages=0;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const message=JSON.parse(raw);
  if(message.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
  const result=message.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'Synthetic research fixture'}}:list(++pages,message.params);
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return {config:{url:`http://127.0.0.1:${server.address().port}/mcp`,allowLocalhost:true},pages:()=>pages};
}
const tools=count=>Array.from({length:count},(_,index)=>({name:`research_${index}`,inputSchema:{type:'object'}}));

test('research providers can discover more than 64 tools while a 256 tool bound remains',async t=>{
 for(const count of [128,256,257]){
  const remote=await toolServer(t,()=>({tools:tools(count)}));
  if(count<=256)assert.equal((await openConnectorSession(remote.config)).tools.length,count);
  else await assert.rejects(openConnectorSession(remote.config),error=>/256/.test(error.message));
 }
});

test('tool discovery accepts eight pages and stops before any ninth page',async t=>{
 const accepted=await toolServer(t,(page,{cursor})=>{
  assert.equal(cursor,page===1?undefined:`page-${page}`);
  return {tools:[{name:`page_${page}`}],...(page<8?{nextCursor:`page-${page+1}`}:{})};
 });
 assert.equal((await openConnectorSession(accepted.config)).tools.length,8);assert.equal(accepted.pages(),8);
 const overflowing=await toolServer(t,page=>({tools:[],nextCursor:`page-${page+1}`}));
 await assert.rejects(openConnectorSession(overflowing.config),error=>/8 页/.test(error.message));assert.equal(overflowing.pages(),8);
 const repeated=await toolServer(t,()=>({tools:[],nextCursor:'same-cursor'}));
 await assert.rejects(openConnectorSession(repeated.config));assert.equal(repeated.pages(),2);
 const tooMany=await toolServer(t,page=>({tools:tools(129),...(page===1?{nextCursor:'next'}:{})}));
 await assert.rejects(openConnectorSession(tooMany.config),error=>/256/.test(error.message));assert.equal(tooMany.pages(),2);
});

test('larger research tool counts do not relax the one-megabyte response bound',async t=>{
 const remote=await toolServer(t,()=>({tools:[{name:'oversized',description:'x'.repeat(1_048_576)}]}));
 await assert.rejects(openConnectorSession(remote.config),{code:'connector_response_too_large'});
});
