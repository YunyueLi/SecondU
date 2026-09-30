import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPERT_TEMPLATES,EXPERT_CATEGORIES,recommendExperts,expertTermMatches,expertDraft,existingExpert,filterExperts,expertShelf} from '../src/agents/expertTemplates.ts';
const fact=(id,statement,status='confirmed',sourceIds=[])=>({id,statement,status,sourceIds,kind:'identity',version:1,history:[],updatedAt:'2026-09-29'});
const goal=(id,title,status='active')=>({id,title,description:'',status,sourceIds:[]});
const context=(patch={})=>({profile:{name:'Test',description:'',demo:false},facts:[],goals:[],sources:[],...patch});

test('expert matching uses whole English words and excludes explicit negative context',()=>{
  assert.equal(expertTermMatches('I react to feedback','react'),true);
  assert.equal(expertTermMatches('A reactive design','react'),false);
  assert.equal(expertTermMatches('Canada is a country','can'),false);
  assert.equal(expertTermMatches('A trip to the guild','ui'),false);
  assert.equal(expertTermMatches('不再做前端开发','前端'),false);
  assert.equal(expertTermMatches('我不是前端工程师','前端'),false);
  assert.equal(expertTermMatches('I am not doing user research','user research'),false);
  assert.equal(expertTermMatches('I used React; I am learning TypeScript','typescript'),true);
});
test('recommendations use confirmed facts and active goals without promoting candidates',()=>{
 const data=context({facts:[fact('candidate','正在做用户研究','candidate'),fact('inferred','我喜欢学习','inferred'),fact('old','安排日程','superseded'),fact('confirmed','正在实现 React 前端')],goals:[goal('paused','写作','paused'),goal('done','产品评审','done'),goal('active','验收本次上线')]});
 const results=recommendExperts(data).filter(item=>item.score>0);
 assert.equal(results[0].template.id,'product-review');assert.equal(results[0].reasons[0].id,'active');assert.equal(results[0].focusId,'validation');
 assert(results.some(item=>item.template.id==='frontend-engineer'));
 assert(!results.some(item=>['user-research','learning-coach','life-planner','writing-editor'].includes(item.template.id)));
});
test('no matching evidence produces no personalization and sample provenance remains explicit',()=>{
 assert(recommendExperts(context()).every(item=>item.score===0&&item.reasons.length===0));
 const items=recommendExperts(context({sources:[{id:'demo-source',demo:true}],facts:[fact('sample','我正在做产品需求','confirmed',['demo-source'])]}));
 assert.equal(items[0].reasons[0].demo,true);
 const profile=recommendExperts(context({profile:{name:'Test',description:'User research consultant',demo:false}}));
 assert.equal(profile[0].reasons[0].kind,'profile');assert.equal(profile[0].reasons[0].demo,false);
});
test('creating a template draft cannot copy recommendation evidence or change existing agents',()=>{
 const data=context({facts:[fact('private','个人敏感标记：React 项目预算 123456')],goals:[goal('private-goal','私人目标：写作书信')]});
 const before=structuredClone(data);const existing={id:'custom',name:'Mine',instructions:'Do not replace my instructions',role:'custom',createdAt:'2026-01-01'};const prior=structuredClone(existing);
 const matches=recommendExperts(data);for(const item of matches){const draft=expertDraft(item.template,'zh-CN',' My expert ',item.focusId);assert(!draft.instructions.includes('123456'));assert(!draft.instructions.includes('私人目标'));assert.equal(draft.name,'My expert');assert.deepEqual(Object.keys(draft).sort(),['instructions','name','role']);assert.equal(existingExpert([existing],item.template),undefined);}
 assert.deepEqual(data,before);assert.deepEqual(existing,prior);
 const template=EXPERT_TEMPLATES[0];const added={...existing,...expertDraft(template,'en','Reviewer',template.focuses[0].id)};assert.equal(existingExpert([added],template),added);
});
test('selected focus changes the actual saved instructions without changing the shared template',()=>{
 const template=EXPERT_TEMPLATES.find(item=>item.id==='frontend-engineer'),before=structuredClone(template);
 const build=expertDraft(template,'zh-CN','前端工程师','implementation'),quality=expertDraft(template,'zh-CN','前端工程师','quality');
 assert.notEqual(build.instructions,quality.instructions);assert(quality.instructions.includes('键盘焦点'));assert.deepEqual(template,before);

});

test('search and categories operate across the library without changing recommendations',()=>{
 const items=recommendExperts(context()),before=structuredClone(items);
 const bySearch=filterExperts(items,'摄影');assert(bySearch.some(item=>item.template.id==='photo-project'));
 const byCategory=filterExperts(items,'','engineering');assert(byCategory.length>0);assert(byCategory.every(item=>item.template.category==='engineering'));
 assert.equal(filterExperts(items,'nothing-matches-92813').length,0);assert.deepEqual(items,before);
 const shelf=expertShelf(items,[]);assert.equal(shelf.length,8);assert(shelf.every(item=>!item.score&&!item.reasons.length));
 const added={id:'mine',createdAt:'2026-09-29',...expertDraft(shelf[0].template,'zh-CN','Mine',shelf[0].focusId)};
 assert(!expertShelf(items,[added]).some(item=>item.template.id===shelf[0].template.id));
});
test('an explicit personalization answer becomes instructions without copying context or forcing a style',()=>{
 const item=recommendExperts(context()).find(item=>item.template.id==='garden-care');
 const draft=expertDraft(item.template,'en','Garden','plan','   Balcony herbs, one hour each week.  ');
 assert(draft.instructions.includes('Balcony herbs, one hour each week.'));assert.equal('avatarStyle' in draft,false);
 assert(!expertDraft(item.template,'en','Garden','plan').instructions.includes('Balcony herbs'));
});

test('professional role labels still recognize agents created with the earlier role name',()=>{
 const template=EXPERT_TEMPLATES.find(item=>item.id==='prototype-builder');
 const prior={id:'existing-prototype',name:'My own label',instructions:template.instructions.zh.replace('你是一位交互原型设计师。','你是一位原型搭建伙伴。')+'\n\nPreviously saved working focus'};
 assert.equal(existingExpert([prior],template),prior);
 assert.equal(prior.name,'My own label');
});


test('every authored expert has exactly one usable domain and search intersects it',()=>{
 const ids=EXPERT_TEMPLATES.map(item=>item.id),domainIds=EXPERT_CATEGORIES.flatMap(group=>[...group.roles]);
 assert.equal(EXPERT_CATEGORIES.length,18);assert.equal(ids.length,124);assert.equal(new Set(domainIds).size,domainIds.length);assert.deepEqual([...domainIds].sort(),[...ids].sort());
 assert(EXPERT_TEMPLATES.every(item=>EXPERT_CATEGORIES.some(group=>group.id===item.category)));
 const items=recommendExperts(context());
 assert.deepEqual(filterExperts(items,'合同','legal').map(item=>item.template.id).sort(),['contract-clause-reviewer','contract-reader']);
 assert.equal(filterExperts(items,'合同','travel').length,0);
 assert(filterExperts(items,'','product').every(item=>EXPERT_CATEGORIES.find(group=>group.id==='product').roles.includes(item.template.id)));
});
