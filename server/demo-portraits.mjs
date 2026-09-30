import { chineseDemoPart } from './demo-zh-data.mjs';
import {demoRecordHash} from './demo-refresh.mjs';
import {updatePersonPortrait,portraitSourceIds} from './person-portrait.mjs';
export const DEMO_PORTRAIT_MARKER='demo-person-portraits-v3';
// Each dimension cites the specific authored source used to describe it.
export function createDemoPortraits() { return chineseDemoPart('portraits'); }

export function applyDemoPortraits(store,data,stamp){
 if(!store.meta('profile').demo||store.get('meta',DEMO_PORTRAIT_MARKER))return;
 const expectedPeople=new Map(data.people.map(person=>[person.id,person])),expectedSources=new Map(data.sources.map(source=>[source.id,source]));
 const report={appliedAt:stamp,added:[],preserved:[]};
 const sourceMatches=id=>{const current=store.get('sources',id),expected=expectedSources.get(id);return current&&expected&&demoRecordHash(current)===demoRecordHash({...expected,createdAt:current.createdAt});};
 store.transaction(()=>{
  for(const [personId,entries] of Object.entries(createDemoPortraits())){
   const current=store.get('people',personId),expected=expectedPeople.get(personId);
   if(!current||!expected||current.portrait!==undefined||demoRecordHash(current)!==demoRecordHash(expected)){report.preserved.push({id:personId,reason:'modified_or_missing_person'});continue;}
   const sourceIds=[...new Set([...current.sourceIds,...entries.flatMap(entry=>entry.sourceIds)])];
   if(sourceIds.some(id=>!sourceMatches(id))){report.preserved.push({id:personId,reason:'modified_or_missing_evidence'});continue;}
   const portrait=updatePersonPortrait(store,{portrait:{schema:'hither.person.v1',entries},basePortraitVersion:0});
   store.put('people',{...current,portrait,sourceIds:[...new Set([...current.sourceIds,...portraitSourceIds(portrait)])]});report.added.push(personId);
  }
  store.setMeta(DEMO_PORTRAIT_MARKER,report);
 });
}
