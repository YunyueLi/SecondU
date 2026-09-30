import test from 'node:test';
import assert from 'node:assert/strict';
import archived from '../server/fixtures/demo-zh-before-v1.json' with {type:'json'};
const createDemoLife=()=>structuredClone(archived.life);
const createDemoPortraits=()=>Object.fromEntries(archived.installed[0].people.map(person=>[person.id,structuredClone(person.portrait.entries)]));
import translations from '../shared/demo-life-translations.json' with {type:'json'};
const chinese=/[\u3400-\u9fff]/;
function check(dictionary,value,where){if(typeof value!=='string'||!chinese.test(value))return;assert.equal(typeof dictionary?.[value],'string',`Missing translation: ${where}`);assert.ok(dictionary[value].trim(),where);assert.doesNotMatch(dictionary[value],chinese,where);assert.doesNotMatch(dictionary[value],/ · /,where);}
test('archived authored life source, milestone and portrait display string has an English equivalent',()=>{
 const life=createDemoLife('2026-09-30T00:00:00.000Z'),portraits=createDemoPortraits();
 assert.equal(life.events.length,8);assert.equal(Object.keys(portraits).length,22);
 for(const source of life.sources)for(const field of ['title','text'])check(translations.sources[source.id],source[field],`${source.id}.${field}`);
 for(const event of life.events)for(const field of ['title','description','location'])check(translations.events[event.id],event[field],`${event.id}.${field}`);
 for(const [id,entries] of Object.entries(portraits))for(const entry of entries)for(const field of ['statement','note'])check(translations.people[id],entry[field],`${entry.id}.${field}`);
 const biography=translations.sources[life.sources[0].id][life.sources[0].text];assert.match(biography,/Caspian/);assert.match(biography,/Zhejiang University/);assert.match(biography,/ByteDance/);assert.match(biography,/Moonshot AI/);assert.match(biography,/2016-09 to 2020-06/);assert.match(biography,/has not officially launched/);
});
test('alternate location punctuation remains translated without changing original identifiers or statuses',()=>{
 for(const input of ['北京 · 海淀','北京海淀'])assert.equal(translations.events['demo-life-v3-move'][input],'Haidian, Beijing');
 for(const input of ['北京 · 奥林匹克森林公园','北京奥林匹克森林公园'])assert.equal(translations.events['demo-life-v3-running'][input],'Olympic Forest Park, Beijing');
 const portraits=createDemoPortraits();assert.equal(portraits['person-self'][4].status,'candidate');assert.equal(portraits['person-self'][7].status,'inferred');assert.equal(portraits['person-self'][0].sourceIds[0],'source-exhibition');
});
