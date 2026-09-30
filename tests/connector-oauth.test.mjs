import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtempSync,realpathSync,rmSync,statSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../server/store.mjs';
import {ConnectorService,saveConnector,publicConnector} from '../server/connectors.mjs';
import {ConnectorOAuthService,discoverOAuth,oauthSecret,oauthTarget} from '../server/connector-oauth.mjs';
import {createApp} from '../server/index.mjs';

async function oauthFixture(t,{noPrm=false,oidc=false,noDcr=false,pkce=true,handler}={}){
  let base,issued=0;const requests=[],clients=[],refreshTokens=new Set();
  const server=http.createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);const raw=Buffer.concat(parts).toString();
    const url=new URL(req.url,base),form=new URLSearchParams(raw);let body;try{body=JSON.parse(raw);}catch{}
    const request={path:url.pathname,headers:req.headers,body,form};requests.push(request);
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(await handler?.({req,res,url,form,body,json,request,base}))return;
    if(url.pathname==='/mcp'){
      if(!req.headers.authorization){res.writeHead(401,{'WWW-Authenticate':noPrm?'Bearer':`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="notes.read"`});res.end();return;}
      if(body.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
      const result=body.method==='initialize'?{protocolVersion:'2025-06-18',serverInfo:{name:'Fictional OAuth service'},capabilities:{tools:{}}}:{tools:[{name:'list_notes',description:'Read fictional notes',inputSchema:{type:'object'},annotations:{readOnlyHint:true}}]};
      json(200,{jsonrpc:'2.0',id:body.id,result});return;
    }
    if(url.pathname.startsWith('/.well-known/oauth-protected-resource')){if(noPrm){json(404,{});return;}json(200,{resource:base+'/mcp',authorization_servers:[base],scopes_supported:['notes.write']});return;}
    if(url.pathname==='/.well-known/oauth-authorization-server'||url.pathname==='/.well-known/openid-configuration'){
      if(oidc&&url.pathname.includes('oauth-authorization')){json(404,{});return;}
      json(200,{issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',...(!noDcr?{registration_endpoint:base+'/register'}:{}),revocation_endpoint:base+'/revoke',code_challenge_methods_supported:pkce?['S256']:[],response_types_supported:['code'],token_endpoint_auth_methods_supported:['none','client_secret_post']});return;
    }
    if(url.pathname==='/register'){clients.push(body);json(201,{client_id:'fictional-client-'+clients.length,redirect_uris:body.redirect_uris,token_endpoint_auth_method:'none'});return;}
    if(url.pathname==='/token'){
      if(form.get('grant_type')==='refresh_token'){
        if(!refreshTokens.delete(form.get('refresh_token'))){json(400,{error:'invalid_grant',error_description:'do-not-expose-provider-detail'});return;}
      }
      issued++;refreshTokens.add('fixture-refresh-'+issued);
      json(200,{access_token:'fixture-access-'+issued,refresh_token:'fixture-refresh-'+issued,token_type:'Bearer',expires_in:3600,scope:'notes.read'});return;
    }
    if(url.pathname==='/revoke'){json(200,{});return;}
    json(404,{});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {base,url:base+'/mcp',requests,clients,refreshTokens};
}
function storeFixture(t,options={}){
  const directory=realpathSync(mkdtempSync(path.join(os.tmpdir(),'secondu-oauth-'))),store=new Store(directory,{seed:false});
  const service=new ConnectorService(store,options);
  t.after(()=>{service.close();store.close();rmSync(directory,{recursive:true,force:true});});
  return {store,service,directory};
}
const definition=(remote,oauth={})=>({kind:'mcp_http',name:'Fictional OAuth service',url:remote.url,allowLocalhost:true,authMode:'oauth',oauth});
async function authorize(service,connectorId,start){
  start??=await service.oauth.start(connectorId);const auth=new URL(start.authorizationUrl),callback=new URL(start.redirectUri);
  callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('code','fixture-authorization-code');
  const response=await fetch(callback);return {start,auth,callback,response,text:await response.text()};
}

test('DCR + PKCE callback persists isolated credentials, discovers actual tools and rotates refresh tokens',async t=>{
  const remote=await oauthFixture(t),{store,service,directory}=storeFixture(t),c=saveConnector(store,definition(remote));
  const start=await service.oauth.start(c.id),auth=new URL(start.authorizationUrl);
  assert.equal(auth.searchParams.get('scope'),'notes.read'); // Challenge beats broader metadata.
  assert.equal(auth.searchParams.get('resource'),remote.url);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  assert.ok(!JSON.stringify(start).includes('code_verifier'));
  const wrong=new URL(start.redirectUri);wrong.searchParams.set('state','wrong');wrong.searchParams.set('code','bad');
  assert.equal((await fetch(wrong)).status,400);assert.equal(remote.requests.filter(r=>r.path==='/token').length,0);
  const result=await authorize(service,c.id,start);assert.equal(result.response.status,200);
  const exchange=remote.requests.find(r=>r.path==='/token').form;
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'));
  assert.equal(exchange.get('redirect_uri'),start.redirectUri);assert.equal(exchange.get('resource'),remote.url);
  assert.equal(service.oauth.status(c.id,start.attemptId).status,'connected');
  const saved=store.require('connectors',c.id),publicValue=publicConnector(store,saved);
  assert.equal(publicValue.status,'ready');assert.equal(publicValue.oauth.authorized,true);assert.equal(publicValue.tools.length,1);
  assert.equal(saved.revision,c.revision+1);assert.equal(oauthSecret(store,saved,'access'),'fixture-access-1');
  assert.equal(statSync(path.join(directory,'credentials.json')).mode&0o777,0o600);
  assert.ok(!JSON.stringify(store.list('connectors')).includes('fixture-access'));assert.ok(!JSON.stringify(publicValue).includes('fixture-refresh'));
  const [first,second]=await Promise.all([service.oauth.refresh(c.id),service.oauth.refresh(c.id)]);
  assert.equal(first,second);assert.equal(first,'fixture-access-2');
  assert.equal(remote.requests.filter(r=>r.path==='/token'&&r.form.get('grant_type')==='refresh_token').length,1);
  assert.equal(oauthSecret(store,saved,'refresh'),'fixture-refresh-2');
  const restored=new Store(directory,{seed:false});t.after(()=>restored.close());
  assert.equal(oauthSecret(restored,restored.require('connectors',c.id),'access'),'fixture-access-2');
  const restart=new ConnectorOAuthService(restored);assert.equal(restart.status(c.id,start.attemptId).status,'expired');restart.close();
  await service.oauth.revoke(c.id);assert.equal(publicConnector(store,store.require('connectors',c.id)).hasToken,false);
  assert.equal(remote.requests.find(r=>r.path==='/revoke').form.get('token'),'fixture-refresh-2');
});

test('manual client and OIDC discovery use only configured app credentials; missing PKCE/DCR reject honestly',async t=>{
  const remote=await oauthFixture(t,{oidc:true,noDcr:true}),f=storeFixture(t);
  let c=saveConnector(f.store,definition(remote));
  await assert.rejects(f.service.oauth.start(c.id),{code:'connector_oauth_client_required'});
  c=saveConnector(f.store,{oauth:{clientId:'my-own-app',clientSecret:'fixture-client-secret',scopes:[]}},f.store.require('connectors',c.id));
  const result=await authorize(f.service,c.id);assert.equal(result.response.status,200);assert.equal(result.auth.searchParams.has('scope'),false);
  const exchange=remote.requests.find(r=>r.path==='/token').form;assert.equal(exchange.get('client_id'),'my-own-app');assert.equal(exchange.get('client_secret'),'fixture-client-secret');
  assert.ok(!JSON.stringify(f.service.list()).includes('fixture-client-secret'));assert.ok(!JSON.stringify(f.store.list('connectors')).includes('fixture-client-secret'));
  const automatic=saveConnector(f.store,{oauth:{scopes:null,issuerUrl:'',resourceUrl:'',callbackPort:null}},f.store.require('connectors',c.id));
  assert.equal(automatic.oauth.scopes,undefined);assert.equal(automatic.oauth.authorized,false);
  const autoStart=await f.service.oauth.start(c.id);assert.equal(new URL(autoStart.authorizationUrl).searchParams.get('scope'),'notes.read');f.service.oauth.invalidate(c.id);
  const noPkce=await oauthFixture(t,{pkce:false});const invalid=saveConnector(f.store,definition(noPkce));
  await assert.rejects(f.service.oauth.start(invalid.id),{code:'connector_oauth_pkce_required'});
  assert.equal(noPkce.clients.length,0);
});

test('explicit issuer supports a manually registered service without PRM; invalid refresh requires login and endpoint edits clear grants',async t=>{
  const remote=await oauthFixture(t,{noPrm:true,noDcr:true}),f=storeFixture(t);
  const c=saveConnector(f.store,definition(remote,{clientId:'own-client',clientSecret:'bound-client-secret',issuerUrl:remote.base,scopes:['notes.read']}));
  assert.equal((await authorize(f.service,c.id)).response.status,200);
  remote.refreshTokens.clear();
  await assert.rejects(f.service.oauth.refresh(c.id),error=>error.code==='connector_oauth_reauthorize'&&!error.message.includes('do-not-expose-provider-detail'));
  const disconnected=publicConnector(f.store,f.store.require('connectors',c.id));assert.equal(disconnected.oauth.authorized,false);assert.equal(disconnected.status,'untested');
  assert.equal(disconnected.oauth.hasClientSecret,true);
  assert.equal((await authorize(f.service,c.id)).response.status,200);
  const changed=saveConnector(f.store,{url:remote.url+'/changed'},f.store.require('connectors',c.id));
  assert.equal(changed.hasToken,false);assert.equal(changed.oauth.authorized,false);assert.equal(changed.oauth.hasClientSecret,false);
});

test('stale edits, timeout, callback replay and cancellation cannot save or resurrect a token',async t=>{
  let release,seen;const waiting=new Promise(r=>seen=r),blocked=new Promise(r=>release=r);
  const remote=await oauthFixture(t,{handler:async({url})=>{if(url.pathname==='/token'){seen();await blocked;}return false;}}),f=storeFixture(t),c=saveConnector(f.store,definition(remote));
  const start=await f.service.oauth.start(c.id),request=authorize(f.service,c.id,start);await waiting;
  const replay=new URL(start.redirectUri);replay.searchParams.set('state',new URL(start.authorizationUrl).searchParams.get('state'));replay.searchParams.set('code','replay');
  assert.equal((await fetch(replay)).status,409);
  saveConnector(f.store,{name:'Edited during consent'},f.store.require('connectors',c.id));release();
  assert.equal((await request).response.status,400);assert.equal(f.service.oauth.status(c.id,start.attemptId).status,'error');assert.equal(publicConnector(f.store,f.store.require('connectors',c.id)).hasToken,false);
  assert.equal(remote.requests.filter(r=>r.path==='/token').length,1);
  const quick=storeFixture(t,{oauth:{attemptTtlMs:15}}),expired=saveConnector(quick.store,definition(remote));
  const exp=await quick.service.oauth.start(expired.id);await new Promise(r=>setTimeout(r,25));assert.equal(quick.service.oauth.status(expired.id,exp.attemptId).status,'expired');
});

test('discovery rejects resource or issuer mismatches, redirects, private DNS and loopback pivots without forwarding secrets',async t=>{
  const remote={url:'https://mcp.example.test/mcp',allowLocalhost:false};
  await assert.rejects(oauthTarget(remote,'https://auth.example.test/token',{resolve:async()=>[{address:'127.0.0.1',family:4}]}),{code:'connector_address_denied'});
  await assert.rejects(oauthTarget({url:'http://127.0.0.1:9999/mcp',allowLocalhost:true},'http://127.0.0.1:9998/token'),{code:'connector_localhost_required'});
  await assert.rejects(oauthTarget({url:'http://127.0.0.1:58645/mcp',allowLocalhost:true},'http://127.0.0.1:58645/token',{blockedPorts:[58645]}),{code:'connector_address_denied'});
  for(const mismatch of ['resource','issuer','redirect']){
    const server=await oauthFixture(t,{handler:({url,json,res,base})=>{
      if(mismatch==='resource'&&url.pathname.startsWith('/.well-known/oauth-protected-resource')){json(200,{resource:'https://other.test/mcp',authorization_servers:[base]});return true;}
      if(mismatch==='issuer'&&url.pathname==='/.well-known/oauth-authorization-server'){json(200,{issuer:'https://other.test',authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',code_challenge_methods_supported:['S256']});return true;}
      if(mismatch==='redirect'&&url.pathname.startsWith('/.well-known/')){res.writeHead(302,{Location:'http://127.0.0.1:1/private'});res.end();return true;}
    }});
    await assert.rejects(discoverOAuth(definition(server)),error=>error.code.startsWith('connector_'));
    assert.equal(server.requests.filter(r=>r.path==='/token').length,0);
  }
});

test('space APIs bind attempts, keep secrets out of bootstrap/export, and local disconnect preserves original space',async t=>{
  const dir=realpathSync(mkdtempSync(path.join(os.tmpdir(),'secondu-oauth-api-'))),remote=await oauthFixture(t),app=createApp({dataDir:dir,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}/api`;
  const call=async(route,method='GET',body)=>{const response=await fetch(base+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:response.status,value:await response.json()};};
  await call('/spaces/personal','POST',{});
  const {value:c}=await call('/spaces/personal/connectors','POST',definition(remote,{clientId:'personal-client',clientSecret:'private-oauth-secret'}));
  const {value:start,status}=await call(`/spaces/personal/connectors/${c.id}/oauth/start`,'POST',{});assert.equal(status,200);
  assert.equal((await call(`/connectors/${c.id}/oauth/status?attemptId=${start.attemptId}`)).status,404);
  const auth=new URL(start.authorizationUrl),callback=new URL(start.redirectUri);callback.searchParams.set('code','fixture-code');callback.searchParams.set('state',auth.searchParams.get('state'));
  assert.equal((await fetch(callback)).status,200);
  const statusResponse=await call(`/spaces/personal/connectors/${c.id}/oauth/status?attemptId=${start.attemptId}`);assert.equal(statusResponse.value.status,'connected');assert.equal(statusResponse.value.connector.status,'ready');
  for(const route of ['/spaces/personal/bootstrap','/spaces/personal/export']){
    const content=JSON.stringify((await call(route)).value);assert.ok(!content.includes('private-oauth-secret'));assert.ok(!content.includes('fixture-access'));assert.ok(!content.includes('fixture-refresh'));
  }
  const disconnected=await call(`/spaces/personal/connectors/${c.id}/oauth/disconnect`,'POST',{});assert.equal(disconnected.value.oauth.authorized,false);assert.equal(disconnected.value.hasToken,false);
  assert.equal(remote.requests.filter(r=>r.path==='/revoke').length,0);
  assert.equal((await call('/connectors')).value.length,0);
});
