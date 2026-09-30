import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthFormConfig} from '../src/connectors/connectorOAuthForm.ts';
import {normalizeOAuth} from '../server/connector-oauth.mjs';

const empty={clientId:'',clientSecret:'',clearClientSecret:false,scopes:'',callbackPort:'',issuerUrl:'',resourceUrl:''};

test('clearing OAuth form fields removes old endpoint/app overrides and restores scope discovery',()=>{
  const previous={clientId:'old-app',scopes:['old.scope'],callbackPort:58991,issuerUrl:'https://old.example.com/',resourceUrl:'https://old.example.com/mcp'};
  const submitted=oauthFormConfig(empty);
  assert.deepEqual(normalizeOAuth(submitted,previous),{});
  assert.equal(Object.hasOwn(submitted,'clientSecret'),false);
  assert.equal(submitted.clearClientSecret,false);
});

test('OAuth form keeps a manual application distinct from its tenant default and explicitly clears a saved secret',()=>{
  const submitted=oauthFormConfig({...empty,clientId:' own-app ',scopes:'notes.read   notes.write',callbackPort:'58992',defaultIssuer:'https://login.example.com/tenant/v2.0',clearClientSecret:true});
  assert.deepEqual(normalizeOAuth(submitted),{clientId:'own-app',scopes:['notes.read','notes.write'],callbackPort:58992,issuerUrl:'https://login.example.com/tenant/v2.0'});
  assert.equal(submitted.clearClientSecret,true);
  assert.equal(oauthFormConfig({...empty,issuerUrl:'https://explicit.example.com',defaultIssuer:'https://default.example.com'}).issuerUrl,'https://explicit.example.com');
});
