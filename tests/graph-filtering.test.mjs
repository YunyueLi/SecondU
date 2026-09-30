import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraphFilterIndex,filterGraph} from '../shared/graph-filtering.mjs';

const source=(id,record,kind='document')=>({id,title:'虚构验收来源',kind,text:`虚构验收来源\n\n本机来源与处理记录\n${JSON.stringify({importBatch:'people-graph-20260930',record})}\n\n虚构证据。`,createdAt:'2026-09-30T00:00:00.000Z',demo:true});
const person=(id,role='',sourceIds=[],description='虚构人物')=>({id,name:id,role,sourceIds,description});
const relation=(from,to,label)=>({id:`${from}-${to}-${label}`,from,to,label,sourceIds:[],description:'虚构关系'});
const ids=result=>[...result.visibleIds].sort();
function fixture(){return buildGraphFilterIndex({
  selfPersonId:'owner',
  sources:[source('s-owner','subject'),source('s-a','canonical-a'),source('s-b','contact-history-001'),{...source('s-ordinary','unrecognized'),title:'人物档案：这个标题不代表结构化来源'}],
  people:[person('owner','本人',['s-owner']),person('a','大学时期',['s-a']),person('b','微信联系人',['s-b']),person('c','其他中学老师和同学',['s-ordinary']),person('d','某公司时期',[],'朋友、同学和同事可能出现在这里，但正文不是已确认关系'),person('orphan','父亲',[])],
  relationships:[relation('owner','a','长期朋友与同学'),relation('owner','b','微信往来'),relation('owner','c','人物档案关系'),relation('a','d','朋友'),relation('owner','missing','父亲')],
});}

test('categories use explicit owner relations and roles without promoting background text or circles',()=>{
  const index=fixture();
  assert.deepEqual(index.personCategories.get('a').sort(),['classmates','friends']);
  assert.deepEqual(index.personCategories.get('b'),['contacts']);
  assert.deepEqual(index.personCategories.get('c'),[]);
  assert.deepEqual(index.personCategories.get('d'),[]);
  assert.deepEqual(index.personCategories.get('owner'),[]);
  assert.deepEqual(index.personCategories.get('orphan'),['family']);
  assert.equal(index.categories.find(value=>value.id==='friends').count,1);
  assert.equal(index.relationships.length,4);
  assert(index.circles.some(value=>value.id==='其他中学老师和同学'&&value.count===1));
  assert.deepEqual(ids(filterGraph(index,{circle:'其他中学老师和同学'})),['c','owner']);
});

test('structured evidence selects source scopes; source titles and portrait review status cannot substitute for provenance',()=>{
  const index=fixture();
  assert.deepEqual(index.sources.map(value=>[value.id,value.count]),[['documented',2],['communication',1],['other',3]]);
  assert.deepEqual(ids(filterGraph(index,{source:'documented'})),['a','owner']);
  assert.deepEqual(ids(filterGraph(index,{source:'communication'})),['b','owner']);
  assert.deepEqual(ids(filterGraph(index,{source:'missing'})),[]);
  const shared=buildGraphFilterIndex({people:[{...person('p','', ['canonical','chat']),portrait:{entries:[{status:'candidate'}]}}],relationships:[],sources:[source('canonical','canonical-p'),source('chat','contact-history-001')]});
  assert.deepEqual(shared.personSources.get('p'),['documented']);
});

test('search and facets intersect while preserving only existing owner edges and never adding the owner to an empty result',()=>{
  const index=fixture();
  const result=filterGraph(index,{query:'Ａ',category:'friends',source:'documented'});
  assert.deepEqual(ids(result),['a','owner']);
  assert.deepEqual(result.matches.map(person=>person.id),['a']);
  assert.equal(result.visibleRelations.length,1);
  assert.deepEqual(ids(filterGraph(index,{query:'does not exist'})),[]);
  assert.deepEqual(ids(filterGraph(index,{category:'friends',source:'communication'})),[]);
  const orphan=filterGraph(index,{query:'orphan'});
  assert.deepEqual(ids(orphan),['orphan']);assert.deepEqual(orphan.visibleRelations,[]);
  assert.deepEqual(ids(filterGraph(index,{query:'orphan',showOrphans:false})),[]);
  assert.deepEqual(ids(filterGraph(index,{relationship:'微信往来'})),['b','owner']);
});

test('local graphs keep exactly one-hop neighbors inside selected scope and hide orphans in the induced graph',()=>{
  const index=fixture();
  assert.deepEqual(ids(filterGraph(index,{focused:'a'})),['a','d','owner']);
  assert.deepEqual(ids(filterGraph(index,{focused:'d'})),['a','d']);
  assert.deepEqual(ids(filterGraph(index,{focused:'a',source:'documented'})),['a','owner']);
  assert.deepEqual(ids(filterGraph(index,{query:'a d',showOrphans:false})),[]);
  const result=filterGraph(index,{focused:'missing'});assert.deepEqual(ids(result),[]);
});

test('missing or invalid profile identity never makes another person the owner, and helpers do not mutate evidence',()=>{
  const input={selfPersonId:'missing',people:[person('person-self','本人'),person('x')],relationships:[relation('person-self','x','父亲')],sources:[]};
  const before=JSON.stringify(input),index=buildGraphFilterIndex(input);
  assert.equal(index.selfPersonId,undefined);assert.deepEqual(index.personCategories.get('x'),[]);
  filterGraph(index,{query:'x'});assert.equal(JSON.stringify(input),before);
});

test('large graph filtering remains bounded by actual records and returns an induced subgraph',()=>{
  const people=[person('owner','本人'),...Array.from({length:3000},(_,i)=>person(`contact-${i}`,'微信联系人'))];
  const relationships=people.slice(1).map(value=>relation('owner',value.id,'微信往来'));
  const index=buildGraphFilterIndex({people,relationships,sources:[],selfPersonId:'owner'});
  const result=filterGraph(index,{query:'contact-2999'});
  assert.deepEqual(ids(result),['contact-2999','owner']);assert.equal(result.visibleRelations.length,1);
  assert.equal(index.categories.find(value=>value.id==='contacts').count,3000);
});
