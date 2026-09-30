import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeed} from '../server/seed.mjs';
import {createDemoExpansion} from '../server/demo-expansion.mjs';
import translations from '../shared/demo-cognition-translations.json' with {type:'json'};
const chinese=/[\u3400-\u9fff]/;
function translated(collection,id,value,field){if(!chinese.test(value||''))return;const result=translations[collection]?.[id]?.[value];assert.equal(typeof result,'string',`Missing English: ${collection}/${id}/${field}`);assert.ok(result.trim());assert.doesNotMatch(result,chinese);assert.doesNotMatch(result,/ · /);return result;}
test('authored facts, feedback history, goals and relationships have complete English display text',()=>{
 const seed=createSeed('2026-09-30T00:00:00Z'),extra=createDemoExpansion('2026-09-30T00:00:00Z');
 assert.equal(Object.keys(translations.facts).length,6);assert.equal(Object.keys(translations.goals).length,8);assert.equal(Object.keys(translations.relationships).length,35);
 for(const fact of seed.facts){translated('facts',fact.id,fact.statement,'statement');for(const version of fact.history){translated('facts',fact.id,version.statement,'history.statement');translated('facts',fact.id,version.reason,'history.reason');}}
 for(const goal of [...seed.goals,...extra.goals])for(const field of ['title','description'])translated('goals',goal.id,goal[field],field);
 for(const relationship of [...seed.relationships,...extra.relationships])for(const field of ['label','description'])translated('relationships',relationship.id,relationship[field],field);
 assert.match(translated('facts','fact-small',seed.facts.find(f=>f.id==='fact-small').statement,'statement'),/^May /,'An inferred preference must not become certain in translation');
 assert.match(translated('goals','demo-v2-goal-rest',extra.goals.find(g=>g.id==='demo-v2-goal-rest').description,'description'),/^Tentatively /,'An unconfirmed travel arrangement must stay tentative');
});
test('relationship labels stay consistent across people and reminder lists are translated',()=>{
 const relations=[...createSeed().relationships,...createDemoExpansion('2026-09-30T00:00:00Z').relationships];
 const labels=new Map();for(const relation of relations.filter(item=>item.from==='person-self')){const label=translated('relationships',relation.id,relation.label,'label');if(labels.has(relation.label))assert.equal(label,labels.get(relation.label));labels.set(relation.label,label);}
 assert.equal(labels.get('同事'),'Colleague');assert.equal(labels.get('导师'),'Mentor');assert.equal(labels.get('老师'),'Teacher');assert.equal(labels.get('长期朋友与同学'),'Long-term friend and classmate');
 assert.equal(translations.goalLists['goal-list-inbox']['提醒事项'],'Reminders');assert.equal(translations.goalLists['goal-list-work']['工作'],'Work');assert.equal(translations.goalLists['goal-list-personal']['个人'],'Personal');
});
