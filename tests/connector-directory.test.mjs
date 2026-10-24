import test from 'node:test';
import assert from 'node:assert/strict';
import {CONNECTOR_CATALOG,CONNECTOR_CATEGORIES,FINANCE_CONNECTOR_CATALOG} from '../shared/connector-catalog.mjs';
import {connectorDirectorySections} from '../src/connectors/connector-directory-model.mjs';

test('discovery starts with common services then groups each remaining service exactly once',()=>{
 const sections=connectorDirectorySections(),ids=sections.flatMap(section=>section.services.map(service=>service.id));
 assert.deepEqual(sections[0].services.map(service=>service.id),['gmail','google-drive','notion','github','slack','google-calendar']);
 assert.deepEqual(sections.slice(1).map(section=>section.id),CONNECTOR_CATEGORIES.filter(category=>category.id!=='all').map(category=>category.id));
 assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual([...ids].sort(),[...CONNECTOR_CATALOG,...FINANCE_CONNECTOR_CATALOG].map(service=>service.id).sort());
 assert.equal(sections.at(-1).id,'finance');
 assert.ok(sections.at(-1).services.every(service=>service.category==='finance'));
});

test('category discovery retains its common services and every native finance adapter',()=>{
 const communication=connectorDirectorySections({category:'communication'});
 assert.equal(communication.length,1);assert.ok(communication[0].services.some(service=>service.id==='gmail'));
 assert.ok(communication[0].services.every(service=>service.category==='communication'));
 const finance=connectorDirectorySections({category:'finance'})[0].services;
 for(const service of FINANCE_CONNECTOR_CATALOG)assert.ok(finance.some(item=>item.id===service.id));
});

test('search returns only matching rows without unrelated category groups',()=>{
 const result=connectorDirectorySections({query:'  GITHUB  '});
 assert.equal(result.length,1);assert.equal(result[0].id,'search');assert.deepEqual(result[0].services.map(service=>service.id),['github']);
 assert.deepEqual(connectorDirectorySections({category:'finance',query:'github'}),[]);
 assert.deepEqual(connectorDirectorySections({query:'no-such-service-fixture'}),[]);
 assert.equal(connectorDirectorySections({query:'财务'})[0].services.length,connectorDirectorySections({category:'finance'})[0].services.length);
});
