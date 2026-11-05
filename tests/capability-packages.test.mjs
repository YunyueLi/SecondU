import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {Store} from '../server/store.mjs';
import {CapabilityService} from '../server/capabilities/service.mjs';
import {inspectPackage,encodeArchive,archiveFiles,filesDigest} from '../server/capabilities/package.mjs';
import {prepareCapabilities} from '../server/capabilities/runtime.mjs';
import {EXPERT_TEMPLATES,expertDraft} from '../src/agents/expertTemplates.ts';
import {createEntity} from '../server/domain.mjs';

const skill=(name='test-method',body='Verify the actual saved output.')=>Buffer.from(`---\nname: ${name}\ndescription: A synthetic verification workflow.\nlicense: MIT\n---\n${body}\n`);
const files=(version='1.0.0')=>({'plugin.json':Buffer.from(JSON.stringify({name:'test-package',version,license:'MIT'})),'skills/test-method/SKILL.md':skill(),'skills/test-method/references/check.md':Buffer.from('Synthetic evidence only.')});
function setup(t){const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-capabilities-'));const store=new Store(path.join(directory,'data'),{seed:false});const service=new CapabilityService(store);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {directory,store,service};}
const upload=(service,values,extra={})=>service.preview({files:Object.entries(values).map(([path,content])=>({path,content:content.toString('utf8')})),...extra});

test('saving work methods and resources independently preserves other settings and definition provenance',t=>{
 const {store,service}=setup(t),skillId=service.snapshot().skills[0].id;
 store.put('sources',{id:'guide',title:'Synthetic guide',text:'Public test guidance.'});
 store.put('connectors',{id:'tools',name:'Synthetic tools'});
 const original=createEntity(store,'agents',{name:'Research assistant',role:'Review sources',capabilities:{skillIds:[skillId],connectorIds:[],sourceIds:[],templateId:'research',templateVersion:'1.0.0',outputContract:{deliverables:['Evidence summary'],checks:['Check sources']}}});
 store.put('agents',original);
 const resources=createEntity(store,'agents',{capabilities:{connectorIds:['tools'],sourceIds:['guide']}},store.require('agents',original.id));store.put('agents',resources);
 assert.deepEqual(resources.capabilities,{...original.capabilities,connectorIds:['tools'],sourceIds:['guide']});
 const methods=createEntity(store,'agents',{capabilities:{skillIds:[],outputContract:{deliverables:['Updated summary'],checks:[]}}},store.require('agents',original.id));store.put('agents',methods);
 assert.deepEqual(methods.capabilities,{...resources.capabilities,skillIds:[],outputContract:{deliverables:['Updated summary'],checks:[]}});
 const renamed=createEntity(store,'agents',{name:'Renamed assistant'},store.require('agents',original.id));assert.deepEqual(renamed.capabilities,methods.capabilities);
 assert.throws(()=>createEntity(store,'agents',{capabilities:{skillIds:['missing']}},methods),{code:'capability_not_installed'});
 assert.throws(()=>createEntity(store,'agents',{capabilities:{sourceIds:['missing']}},methods),{status:404});
 assert.equal(createEntity(store,'agents',{capabilities:null},methods).capabilities,undefined);
});

test('portable single skill, plugin archive and source references preserve identity and bytes',()=>{
 const one=inspectPackage({'SKILL.md':skill('single-method')});assert.equal(one.package.id,'single-method');
 const original=files(),roundtrip=archiveFiles(encodeArchive(original));assert.equal(filesDigest(roundtrip),filesDigest(original));
 const parsed=inspectPackage(roundtrip);assert.equal(parsed.package.skills[0].name,'test-method');assert.deepEqual(parsed.package.skills[0].resources,['references/check.md']);assert.equal(parsed.package.license,'MIT');
});
test('invalid paths, duplicate case, missing body and malformed dependency declarations fail before persistence',()=>{
 for(const values of [{'../SKILL.md':skill()},{'SKILL.md':skill(),'skill.md':skill()},{'SKILL.md':Buffer.from('---\nname: x\ndescription: Test\n---\n')},{'SKILL.md':skill(),'SKILL.json':Buffer.from('{"secondu":{"requires":{"bins":12}}}')},{'SKILL.md':skill(),'.env':Buffer.from('SECRET=synthetic')}])assert.throws(()=>inspectPackage(values),{status:400});
});
test('MCP manifests retain declarations without accepting bundled credential values',()=>{
 const valid={...files(),'mcp.json':Buffer.from(JSON.stringify({mcpServers:{docs:{url:'https://example.test/mcp',env:{TOKEN:'${TOKEN}'}}}}))};assert.equal(inspectPackage(valid).package.connectors[0].transport,'http');
 assert.throws(()=>inspectPackage({...valid,'mcp.json':Buffer.from('{"mcpServers":{"docs":{"url":"https://example.test","env":{"TOKEN":"literal-private-value"}}}}')}),{status:400});
});
test('installation, restart, update conflict, rollback, removal and restore preserve version provenance',t=>{
 const {store,service}=setup(t),first=upload(service,files());const original=service.install(first);assert.equal(original.version,'1.0.0');
 assert.equal(new CapabilityService(store).record(original.id).digest,original.digest);
 const next=upload(service,files('2.0.0'),{existingId:original.id}),stale=upload(service,files('3.0.0'),{existingId:original.id});
 const updated=service.install(next);assert.notEqual(updated.digest,original.digest);assert.throws(()=>service.install(stale),{code:'capability_version_conflict'});
 assert.equal(service.rollback(original.id,{digest:original.digest}).version,'1.0.0');
 service.remove(original.id);assert.equal(service.snapshot().archived.length,1);assert.equal(service.restore(original.id).version,'1.0.0');assert.equal(service.snapshot().archived.length,0);
});
test('disabled skills and missing dependencies block execution without silently dropping the capability',t=>{
 const {service,directory}=setup(t),pack=service.install(upload(service,files()));service.configure(pack.id,{disabledSkills:[pack.skills[0].id]});
 const agent={id:'a',name:'Synthetic expert',capabilities:{skillIds:[pack.skills[0].id]}};
 assert.throws(()=>prepareCapabilities(service,agent,{}, {codexHome:path.join(directory,'runtime')}),{code:'INPUT_REQUIRED'});
 service.configure(pack.id,{disabledSkills:[]});assert.equal(prepareCapabilities(service,agent,{}, {codexHome:path.join(directory,'runtime')}).entries.length,1);
});
test('expert source snapshots stay scoped, retain original contents, and reject credential disclosure',async t=>{
 const {service,store,directory}=setup(t);store.put('sources',{id:'bound',title:'Synthetic guide',text:'Original controlled evidence.'});store.put('sources',{id:'other',title:'Unbound',text:'Must not be returned.'});
 const agent={id:'a',name:'Expert',capabilities:{skillIds:[],sourceIds:['bound']}};
 const runtime=prepareCapabilities(service,agent,{}, {codexHome:path.join(directory,'runtime')});
 store.put('sources',{id:'bound',title:'Changed',text:'Changed after preparation.'});
 const result=JSON.parse((await runtime.call({arguments:{sourceId:'bound'}})).contentItems[0].text);assert.equal(result.text,'Original controlled evidence.');
 await assert.rejects(runtime.call({arguments:{sourceId:'other'}}),{code:'capability_knowledge_scope'});
 const list=JSON.parse((await runtime.call({arguments:{}})).contentItems[0].text);assert.equal(list.sources.length,1);assert.equal(list.sources[0].id,'bound');
});
test('binding a package preserves its files, detects tampering and prevents removal while an expert uses it',t=>{
 const {service,store,directory}=setup(t),pack=service.install(upload(service,files()));const agent={id:'expert',name:'Expert',capabilities:{skillIds:[pack.skills[0].id]}};store.put('agents',agent);
 const runtime=prepareCapabilities(service,agent,{}, {codexHome:path.join(directory,'runtime')});assert.equal(readFileSync(runtime.entries[0].path,'utf8'),skill().toString());
 assert.throws(()=>service.remove(pack.id),{code:'capability_in_use'});
 const target=path.join(service.root,'packages',pack.id,pack.digest,'skills/test-method/SKILL.md');writeFileSync(target,skill('tampered'));assert.throws(()=>service.files(pack),{code:'capability_integrity'});
});
test('all expert templates bind installed domain methods and private knowledge stays opt-in',t=>{
 const {service}=setup(t),installed=new Set(service.snapshot().skills.map(skill=>skill.id));assert.equal(EXPERT_TEMPLATES.length,124);
 for(const template of EXPERT_TEMPLATES){const draft=expertDraft(template,'en','Expert',template.focuses[0].id);assert(draft.capabilities.skillIds.length>0,template.id);assert(draft.capabilities.skillIds.every(id=>installed.has(id)),template.id);assert.deepEqual(draft.capabilities.sourceIds,[]);assert.deepEqual(draft.capabilities.connectorIds,[]);assert.equal(draft.capabilities.templateId,template.id);}
});
test('bundled Office and Agency packages retain their upstream licenses and executable resources',t=>{
 const {service}=setup(t),office=service.record('secondu-office'),agency=service.record('agency-methods');
 assert.equal(office.license,'MIT');assert.equal(agency.license,'MIT');assert(service.files(office)['PROVENANCE.json']);assert(service.files(agency)['PROVENANCE.json']);
 assert(office.skills[0].resources.includes('scripts/office.mjs'));assert.equal(agency.skills.length,13);
});
