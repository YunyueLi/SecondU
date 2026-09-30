import test from 'node:test';
import assert from 'node:assert/strict';
import archived from '../server/fixtures/demo-zh-before-v1.json' with {type:'json'};
const createSeed=()=>structuredClone(archived.seed);
const createDemoExpansion=()=>structuredClone(archived.expansion);
import translations from '../shared/demo-conversation-translations.json' with {type:'json'};
const chinese=/[\u3400-\u9fff]/;
function translated(dictionary,value,where){const result=dictionary?.[value];assert.equal(typeof result,'string',`Missing translation: ${where}`);assert.ok(result.trim(),where);assert.doesNotMatch(result,chinese,where);assert.doesNotMatch(result,/ · /,where);return result;}
test('all 17 established conversations retain complete translated messages and source transcripts',()=>{
 const stamp='2026-09-30T00:00:00.000Z',seed=createSeed(stamp),extra=createDemoExpansion(stamp),conversations=[...seed.conversations,...extra.conversations],sources=[...seed.sources,...extra.sources];let count=0;
 assert.equal(Object.keys(translations.conversations).length,17);assert.equal(Object.keys(translations.sources).length,17);
 for(const [id,dictionary] of Object.entries(translations.conversations)){
  const conversation=conversations.find(record=>record.id===id);assert.ok(conversation,id);translated(dictionary,conversation.title,`${id}.title`);
  for(const message of conversation.messages){translated(dictionary,message.content,`${id}/${message.id}`);count++;}
  for(const sourceId of new Set(conversation.messages.map(message=>message.sourceId))){const source=sources.find(record=>record.id===sourceId);assert.ok(source,sourceId);const sourceDictionary=translations.sources[sourceId];translated(sourceDictionary,source.title,`${sourceId}.title`);const body=translated(sourceDictionary,source.text,`${sourceId}.text`);assert.equal(body.split('\n').length,source.text.split('\n').length,`${sourceId}: no omitted lines`);for(const message of conversation.messages)assert.ok(body.includes(dictionary[message.content]),`${sourceId}/${message.id}: source keeps translated message`);}
 }
 assert.equal(count,164);
});
