import test from 'node:test';
import assert from 'node:assert/strict';
import {CONNECTOR_CATALOG,findCatalogService,resolveCatalogEndpoint} from '../shared/connector-catalog.mjs';

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
