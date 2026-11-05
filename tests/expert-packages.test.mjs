import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {Store} from '../server/store.mjs';
import {createApp} from '../server/index.mjs';
import {createEntity} from '../server/domain.mjs';
import {createRoom} from '../server/rooms.mjs';
import {CapabilityService} from '../server/capabilities/service.mjs';
import {inspectPackage,archiveFiles,runtimeSkillFile} from '../server/capabilities/package.mjs';

const b=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
function setup(t){const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-expert-'));const store=new Store(path.join(directory,'data'),{seed:false}),service=new CapabilityService(store);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {directory,store,service};}
function pack(extra={}){return {'plugin.json':b({name:'portable-experts',version:'1.0.0',expertType:'team',agentName:'lead',displayName:'Synthetic review team',teamInfo:{leadAgent:'lead',memberAgents:['research','review']},secondu:{workflow:[{id:'research',title:'Research',members:['research'],after:[]},{id:'review',title:'Review',members:['review'],after:['research']}]},...extra}),'agents/lead.md':b('---\nname: lead\ndescription: Coordinate a review\n---\nDelegate and collect evidence.'),'agents/research.md':b('---\nname: research\ndescription: Check evidence\nskills: [secondu-core/research]\n---\nRead only the supplied sources.'),'agents/review.md':b('---\nname: review\ndescription: Review conclusions\n---\nReport discrepancies.')};}
const install=(service,files)=>service.install(service.preview({files:Object.entries(files).map(([path,content])=>({path,content:content.toString('utf8')}))}));

test('portable team definitions preserve explicit roles and stages without granting tools',()=>{
 const inspected=inspectPackage(pack()).package;assert.equal(inspected.skills.length,0);assert.equal(inspected.experts.length,3);assert.equal(inspected.teams.length,1);assert.deepEqual(inspected.teams[0].workflow[1].after,['research']);assert.deepEqual(inspected.experts[1].unresolvedSkills,['secondu-core/research']);
 for(const change of [{agents:['../outside.md']},{teamInfo:{leadAgent:'missing',memberAgents:['research']}},{teamInfo:{leadAgent:'lead',memberAgents:['lead']}},{secondu:{workflow:[{id:'cycle',members:['research'],after:['cycle']}]}},{secondu:{workflow:[{id:'bad',members:['missing']}]}},{secondu:{workflow:'invalid'}}])assert.throws(()=>inspectPackage(pack(change)),{status:400});
});
test('WorkBuddy legacy skill metadata is adapted only inside its declared package',()=>{
 const files={...pack({expertType:'agent',agentName:'lead'}),'skills/drawing/SKILL.md':b('---\ntitle: Drawing review\nsummary: Inspect the supplied diagram.\n---\nCheck every label.')};files['.codebuddy-plugin/plugin.json']=files['plugin.json'];delete files['plugin.json'];
 const skill=inspectPackage(files).package.skills[0];assert.equal(skill.name,'drawing');assert.equal(skill.adaptation,'workbuddy-title-summary-v1');assert.match(runtimeSkillFile(skill,files[skill.path]).toString(),/name: "drawing"/);assert(!files[skill.path].toString().includes('name:'));
 files['plugin.json']=files['.codebuddy-plugin/plugin.json'];delete files['.codebuddy-plugin/plugin.json'];assert.throws(()=>inspectPackage(files),{status:400});
});
test('authored expert and team export round trips instructions, skill versions and stages without private bindings',t=>{
 const {store,service}=setup(t),skill=service.snapshot().skills[0];
 store.put('sources',{id:'private-source',title:'Private',text:'private-knowledge-marker'});
 store.put('connectors',{id:'private-connector',kind:'library',name:'Private library',enabled:true});
 const lead=store.put('agents',createEntity(store,'agents',{name:'Lead',role:'Coordinate',instructions:'Collect and check work.',capabilities:{skillIds:[skill.id],sourceIds:['private-source'],connectorIds:['private-connector'],outputContract:{deliverables:['Review report'],checks:['Evidence linked']}}}));
 const worker=store.put('agents',createEntity(store,'agents',{name:'Reviewer',role:'Review',instructions:'Verify provided evidence.'}));
 const room=createRoom(store,{title:'Synthetic review',kind:'group',agentIds:[lead.id,worker.id],mode:'live',team:{leadAgentId:lead.id,workflow:[{id:'review',title:'Review evidence',description:'Return issues.',agentIds:[worker.id],after:[],required:true}]}});
 for(const [kind,id] of [['expert',lead.id],['team',room.id]]){
  const exported=service.exportDefinition({kind,id}),files=archiveFiles(exported.bytes()),serialized=Object.values(files).map(value=>value.toString()).join('\n');
  for(const excluded of ['private-source','private-knowledge-marker','private-connector',lead.id,worker.id])assert(!serialized.includes(excluded),excluded);
  assert(serialized.includes('Collect and check work.'));assert(serialized.includes(skill.digest));assert.equal(exported.preview.excluded.sources,1);
  const installed=install(service,files),draft=kind==='expert'?service.expertDraft(installed.id,{definitionId:installed.experts[0].id}):service.teamDraft(installed.id,{teamId:installed.teams[0].id}).members[0].draft;
  assert.deepEqual(draft.capabilities.skillIds,[skill.id]);assert.deepEqual(draft.capabilities.sourceIds,[]);assert.deepEqual(draft.capabilities.connectorIds,[]);assert.equal(draft.instructions,lead.instructions);
  if(kind==='team')assert.deepEqual(installed.teams[0].workflow[0].memberExpertIds,[installed.experts[1].id]);
 }
 const prior=service.exportDefinition({kind:'expert',id:lead.id});store.put('agents',{...lead,instructions:'Changed definition.'});assert.throws(()=>service.exportDefinition({kind:'expert',id:lead.id,expectedDigest:prior.preview.digest}),{code:'expert_export_stale'});
});
test('expert exports reject configured secrets and never grant model or connector access',t=>{
 const {store,service}=setup(t),connection=store.connection();store.setKey(connection,'synthetic-export-key-value');const agent=store.put('agents',createEntity(store,'agents',{name:'Synthetic',role:'Review',instructions:'Do not share synthetic-export-key-value.'}));
 assert.throws(()=>service.exportDefinition({kind:'expert',id:agent.id}),{code:'expert_export_sensitive'});
});
test('team creation API is atomic when one definition is invalid and creates independent copies when valid',async t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-expert-api-')),app=createApp({dataDir:directory,seed:false,scheduler:false,computerInfo:{codexAvailable:false}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 const request=async(route,body)=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
 const catalogue=app.bootstrap().capabilities,team=catalogue.teams[0],before=app.store.list('agents').length;
 const failed=await request(`capabilities/${team.packageId}/create-team`,{teamId:team.id,bindings:{[team.memberExpertIds.at(-1)]:{name:'x'.repeat(201)}}});assert.equal(failed.status,400);assert.equal(app.store.list('agents').length,before);assert.equal(app.store.list('agentRooms').length,0);
 const result=await request(`capabilities/${team.packageId}/create-team`,{teamId:team.id});assert.equal(result.status,201);assert.equal(result.value.agents.length,team.memberExpertIds.length+1);assert(result.value.room.team.workflow.length);assert(result.value.agents.every(agent=>!agent.connectionId&&agent.capabilities.sourceIds.length===0&&agent.capabilities.connectorIds.length===0));
});
