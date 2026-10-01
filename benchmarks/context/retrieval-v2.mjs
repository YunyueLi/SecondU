/** Transparent lexical baseline. Query terms come only from the visible task. */
const stop=new Set('a an the and or for of to in on at by with from my me i it is are be as this that using use choose select only not then do has have when any all its into after before'.split(' '));
export function terms(value){return String(value).toLowerCase().match(/[a-z0-9]+/g)?.filter(word=>word.length>1&&!stop.has(word))??[];}
export function rawRetrieval(records,query,{budgetChars,questionAt}){
 const documents=records.map(record=>terms(`${record.event.statement} ${record.event.field} ${record.event.speaker}`));
 const frequencies=documents.map(doc=>{const map=new Map();for(const word of doc)map.set(word,(map.get(word)||0)+1);return map;});
 const queryTerms=[...new Set(terms(query))],N=documents.length,average=documents.reduce((n,doc)=>n+doc.length,0)/Math.max(1,N),k1=1.2,b=.75;
 const scored=records.map((record,index)=>{
  let score=0;for(const term of queryTerms){const frequency=frequencies[index].get(term)||0;if(!frequency)continue;const containing=frequencies.filter(map=>map.has(term)).length,idf=Math.log(1+(N-containing+.5)/(containing+.5));score+=idf*frequency*(k1+1)/(frequency+k1*(1-b+b*documents[index].length/Math.max(1,average)));}
  return {...record,score,index};
 });
 // A field/owner chain stays intact: an old statement cannot be retrieved while
 // silently omitting its correction or withdrawal. This does not inspect gold.
 const groups=new Map();for(const record of scored){const key=`${record.event.owner}:${record.event.field}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);}
 const ranked=[...groups.values()].map(items=>({items,score:Math.max(...items.map(row=>row.score)),key:items.map(row=>row.sourceId).sort()[0]})).filter(group=>group.score>0).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
 const selected=[],omitted=[];
 const serialize=items=>JSON.stringify({schema:'secondu.raw-retrieval.v2',questionAt,method:'BM25 k1=1.2 b=0.75; complete field-owner event chains; stable source-id ties; chronological presentation',sources:[...items].sort((a,b)=>a.event.at.localeCompare(b.event.at)||a.index-b.index).map(record=>({sourceId:record.sourceId,document:record.document}))});
 for(const group of ranked){if(serialize([...selected,...group.items]).length<=budgetChars)selected.push(...group.items);else omitted.push(...group.items.map(row=>row.sourceId));}
 const context=serialize(selected);
 return {context,sourceIds:selected.map(row=>row.sourceId),omittedSourceIds:omitted,candidates:ranked.reduce((sum,row)=>sum+row.items.length,0),chars:context.length};
}
