import test from 'node:test';
import assert from 'node:assert/strict';
import {CONNECTOR_CATALOG,CONNECTOR_CATEGORIES,FINANCE_CONNECTOR_CATALOG,FINANCE_RESEARCH_CATALOG_CHECKED_AT,findCatalogService,resolveCatalogEndpoint} from '../shared/connector-catalog.mjs';

test('catalogue binding recognition requires the actual endpoint, not a borrowed service name',()=>{
 const github=CONNECTOR_CATALOG.find(item=>item.id==='github');
 assert.equal(findCatalogService({kind:'mcp_http',url:github.endpoint}).id,'github');
 for(const url of ['not-a-url','https://unrelated.example/mcp/','https://api.githubcopilot.com.evil.example/mcp/','https://api.githubcopilot.com/mcp/?credential=secret'])assert.equal(findCatalogService({kind:'mcp_http',catalogId:'github',url}),undefined);
 assert.equal(findCatalogService({kind:'library',catalogId:'github',url:github.endpoint}),undefined);
 assert.equal(findCatalogService({kind:'mcp_http',catalogId:'slack',url:github.endpoint}),undefined);
});
test('tenant endpoints accept an exact tenant identifier and never interpolate arbitrary addresses',()=>{
 const outlook=CONNECTOR_CATALOG.find(item=>item.id==='outlook-mail'),tenant='11111111-2222-3333-4444-555555555555';
 const url=resolveCatalogEndpoint(outlook,tenant);
 assert.equal(url,`https://agent365.svc.cloud.microsoft/agents/tenants/${tenant}/servers/mcp_MailTools`);
 assert.equal(findCatalogService({kind:'mcp_http',catalogId:outlook.id,url}).id,outlook.id);
 for(const value of ['','common','../other','https://example.com','11111111-2222-3333-4444-555555555555/../x'])assert.equal(resolveCatalogEndpoint(outlook,value),'');
 assert.equal(findCatalogService({kind:'mcp_http',url:url.replace(tenant,'common')}),undefined);
});
test('the local Lark entry only recognizes its explicitly bound loopback service',()=>{
 assert.equal(findCatalogService({kind:'mcp_http',catalogId:'feishu',url:'http://localhost:3100/mcp'}).id,'feishu');
 assert.equal(findCatalogService({kind:'mcp_http',catalogId:'feishu',url:'https://unrelated.example/mcp'}),undefined);
 assert.equal(findCatalogService({kind:'mcp_http',url:'http://localhost:3100/mcp'}),undefined);
});

test('finance discovery includes only implemented connection adapters, not manually recorded institutions',()=>{
 assert.ok(CONNECTOR_CATEGORIES.some(category=>category.id==='finance'));
 assert.deepEqual(FINANCE_CONNECTOR_CATALOG.map(service=>service.id),['plaid','teller','truelayer','ibkr_flex','snaptrade','moomoo']);
 for(const service of FINANCE_CONNECTOR_CATALOG){assert.equal(service.category,'finance');assert.equal(service.endpoint,undefined);assert.equal(service.method,service.id==='moomoo'?'moomoo':'provider');}
 const listedIds=new Set([...CONNECTOR_CATALOG,...FINANCE_CONNECTOR_CATALOG].map(service=>service.id));
 for(const institution of ['ibkr','cmb','icbc','boc','abc','dbs','scb','hsbc','bochk','alipay'])assert.equal(listedIds.has(institution),false,`${institution} has no implemented connection adapter`);
 assert.ok(FINANCE_CONNECTOR_CATALOG.every(native=>!CONNECTOR_CATALOG.some(mcp=>mcp.id===native.id)),'Native finance adapters must not be advertised as MCP endpoints');
});

test('financial research discovery registers exact first-party MCP endpoints and account requirements',()=>{
 const endpoints={
  'alpha-vantage':'https://mcp.alphavantage.co/mcp',morningstar:'https://mcp.morningstar.com/mcp',factset:'https://mcp.factset.com/content/v1',
  daloopa:'https://mcp.daloopa.com/server/mcp','fiscal-ai':'https://api.fiscal.ai/mcp',quartr:'https://mcp.quartr.com/mcp',
  crunchbase:'https://mcp.crunchbase.com',fmp:'https://financialmodelingprep.com/mcp',lseg:'https://api.analytics.lseg.com/lfa/mcp',
 };
 const financial=CONNECTOR_CATALOG.filter(service=>service.category==='finance');
 assert.deepEqual(financial.map(service=>service.id).sort(),Object.keys(endpoints).sort());
 for(const service of financial){
  assert.equal(service.endpoint,endpoints[service.id]);assert.equal(service.checkedAt,FINANCE_RESEARCH_CATALOG_CHECKED_AT);
  assert.equal(new URL(service.endpoint).search,'');assert.ok(service.requirement&&service.requirementEn&&service.docsUrl.startsWith('https://'));
  assert.equal(findCatalogService({kind:'mcp_http',url:service.endpoint,catalogId:service.id}),service);
 }
 assert.equal(financial.find(service=>service.id==='crunchbase').oauthRegistration,'manual');
 const daloopa=financial.find(service=>service.id==='daloopa');
 assert.deepEqual(daloopa.authMethods,['oauth','bearer']);assert.equal(daloopa.tokenLabelEn,'MCP token');
 assert.match(daloopa.requirementEn,/24 hours.*Exchange an API key.*for a token/);
 assert.deepEqual(financial.find(service=>service.id==='quartr').scopes,['mcp:read']);
 assert.match(financial.find(service=>service.id==='quartr').requirementEn,/individual research.*student.*Public API/);
 assert.deepEqual(financial.filter(service=>service.queryAuthKey).map(service=>[service.id,service.queryAuthKey,service.tokenLabel]),[['fmp','apikey','API key']]);
});
