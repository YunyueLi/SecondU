import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSavedAgents,savedAgentDomain,savedAgentLastUsed} from '../src/agents/agentDirectoryData.ts';
import {EXPERT_TEMPLATES,expertDraft} from '../src/agents/expertTemplates.ts';
const agent=(id,name,createdAt='2026-09-20',patch={})=>({id,name,role:'角色',instructions:'',createdAt,...patch});
const expert=(id,templateId,createdAt='2026-09-20')=>agent(id,'',createdAt,expertDraft(EXPERT_TEMPLATES.find(item=>item.id===templateId),'zh-CN','自己的称呼','plan'));

test('saved agent domains use stable sample identities or exact template lineage, leaving custom roles explicit',()=>{
 assert.equal(savedAgentDomain(agent('agent-planner','我的项目助理')),'quality');
 assert.equal(savedAgentDomain(agent('demo-v2-agent-writer','文字编辑')),'creation');
 assert.equal(savedAgentDomain(expert('saved-law','contract-clause-reviewer')),'legal');
 assert.equal(savedAgentDomain(agent('custom','前端工程师',{},{instructions:'我的自定义工作说明'})),'custom');
});
test('domain and word search intersect actual saved name, role and instructions without mutating the roster',()=>{
 const agents=[expert('law','contract-clause-reviewer'),expert('travel','travel-planner'),agent('custom','我的阅读助理','2026-09-21',{instructions:'整理苏州城市史'})];const before=structuredClone(agents);
 assert.deepEqual(filterSavedAgents(agents,[],'合同','legal','recent').map(item=>item.id),['law']);
 assert.equal(filterSavedAgents(agents,[],'合同','travel','recent').length,0);
 assert.deepEqual(filterSavedAgents(agents,[],'苏州','custom','recent').map(item=>item.id),['custom']);
 assert.equal(filterSavedAgents(agents,[],'no-result-192','all','recent').length,0);
 assert.equal(filterSavedAgents(agents,[],'','all','recent').length,3);assert.deepEqual(agents,before);
});
test('recent activity and recently added are different stable orderings; unworked roles have no invented activity',()=>{
 const agents=[agent('new','新助理','2026-09-30'),agent('older','旧助理','2026-09-01'),agent('hither','SecondU','2026-09-30')];
 const tasks=[{agentIds:['older'],updatedAt:'2026-09-29'},{agentIds:['someone-else'],updatedAt:'2026-09-30'}];
 assert.deepEqual(filterSavedAgents(agents,tasks,'','all','recent').map(item=>item.id),['older','new']);
 assert.deepEqual(filterSavedAgents(agents,tasks,'','all','created').map(item=>item.id),['new','older']);
 assert.equal(savedAgentLastUsed(agents[0],tasks),'');
 assert.deepEqual(filterSavedAgents(agents,tasks,'','all','recent'),filterSavedAgents(agents,tasks,'','all','recent'));
});
