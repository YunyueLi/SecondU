import { createHash } from 'node:crypto';
import baseline from './fixtures/demo-baseline-v3.json' with {type:'json'};
import engineerBaseline from './fixtures/demo-baseline-v4.json' with {type:'json'};
import caspianBaseline from './fixtures/demo-baseline-v5.json' with {type:'json'};
const collections=['sources','facts','people','agents','relationships','events','conversations','goals','agentRooms'];
const keyOf=(collection,id)=>`${collection}:${id}`;
const marker='demo-engineer-v4';
export const DEMO_MATCHER_VERSION=4;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const demoRecordHash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function materialize(template,current){
 if(template===baseline.stamp)return typeof current==='string'&&Number.isFinite(Date.parse(current))?current:baseline.stamp;
 if(Array.isArray(template))return template.map((value,index)=>materialize(value,current?.[index]));
 if(template&&typeof template==='object')return Object.fromEntries(Object.entries(template).map(([key,value])=>[key,materialize(value,current?.[key])]));
 return template;
}
const matches=(current,template)=>!!current&&demoRecordHash(current)===demoRecordHash(materialize(template,current));
function templates(){
 const result=new Map();
 for(const data of [baseline.seed,baseline.gitHeadSeed,baseline.preFactRevisionSchema,baseline.expansion,baseline.life,{events:baseline.scopedEvents},engineerBaseline.seed,engineerBaseline.expansion,engineerBaseline.life,...engineerBaseline.installed,caspianBaseline.seed,caspianBaseline.expansion,caspianBaseline.life,...caspianBaseline.installed])for(const collection of collections)for(const item of data[collection]??[]){const key=keyOf(collection,item.id);result.set(key,[...(result.get(key)??[]),item]);}
 return result;
}
function refs(entity){
 return [...(entity.sourceIds??[]).map(id=>['sources',id]),...(entity.personIds??[]).map(id=>['people',id]),...(entity.agentIds??[]).map(id=>['agents',id]),...(entity.from?[['people',entity.from],['people',entity.to]]:[]),...(entity.messages??[]).flatMap(message=>[...(message.sourceId?[['sources',message.sourceId]]:[]),...(message.sourceIds??[]).map(id=>['sources',id])])];
}
function timestampTemplate(entity,stamp){
 if(Array.isArray(entity))return entity.map(value=>timestampTemplate(value,stamp));
 if(entity&&typeof entity==='object')return Object.fromEntries(Object.entries(entity).map(([key,value])=>[key,timestampTemplate(value,stamp)]));
 return entity===stamp?baseline.stamp:entity;
}
export function refreshFictionalDemo(store,data,stamp){
 if(!store.meta('profile').demo||store.get('meta',marker)?.value?.matcherVersion>=DEMO_MATCHER_VERSION)return;
 const legacy=templates(),desired=new Map(),states=new Map(),reasons=new Map(),report={version:6,matcherVersion:DEMO_MATCHER_VERSION,appliedAt:stamp,updated:[],added:[],preserved:[],unchanged:[],preservedReasons:{}};
 const installed=new Set(Object.entries(baseline.seed).flatMap(([collection,items])=>Array.isArray(items)?items.map(item=>keyOf(collection,item.id)):[]));
 if(store.get('meta','demo-migrations')?.value?.versions?.includes(2))for(const [collection,items] of Object.entries(baseline.expansion))for(const item of items)installed.add(keyOf(collection,item.id));
 if(store.get('meta',marker)?.value?.matcherVersion>=2)for(const data of [engineerBaseline.seed,engineerBaseline.expansion,engineerBaseline.life])for(const [collection,items] of Object.entries(data))if(Array.isArray(items))for(const item of items)installed.add(keyOf(collection,item.id));
 if(store.get('meta',marker)?.value?.matcherVersion>=3)for(const data of [caspianBaseline.seed,caspianBaseline.expansion,caspianBaseline.life])for(const [collection,items] of Object.entries(data))if(Array.isArray(items))for(const item of items)installed.add(keyOf(collection,item.id));
 if(store.get('meta','demo-life-v3'))for(const [collection,items] of Object.entries(baseline.life))for(const item of items)installed.add(keyOf(collection,item.id));
 for(const collection of collections)for(const entity of data[collection]??[]){
  const key=keyOf(collection,entity.id),current=store.get(collection,entity.id);desired.set(key,{collection,entity,current});
  if(matches(current,timestampTemplate(entity,stamp)))states.set(key,'unchanged');
  else if(current){states.set(key,(legacy.get(key)??[]).some(template=>matches(current,template))?'updated':'preserved');if(states.get(key)==='preserved')reasons.set(key,'modified_record');}
  else {states.set(key,installed.has(key)?'preserved':'added');if(states.get(key)==='preserved')reasons.set(key,'deleted_default');} // Missing installed defaults are user deletions.
 }
 // A user-corrected record must retain its original evidence, even if that source
 // itself still equals an old fixture. No task, prompt, artifact or source import is edited.
 const dependenciesToKeep=new Set();
 for(const collection of collections)for(const current of store.list(collection)){
  const key=keyOf(collection,current.id),known=(legacy.get(key)??[]).some(template=>matches(current,template));
  if(states.get(key)==='unchanged'||known)continue;
  for(const [type,id] of refs(current))if(desired.has(keyOf(type,id)))dependenciesToKeep.add(keyOf(type,id));
 }
 for(const key of dependenciesToKeep)if(states.get(key)==='updated'){states.set(key,'preserved');reasons.set(key,'referenced_by_modified_record');}
 // Resolve the full plan before writing sources. If a dependent cannot safely
 // migrate, its original evidence must not be rewritten underneath it.
 let changed=true;
 while(changed){
  changed=false;
  const preserve=(key,reason)=>{if(['updated','added'].includes(states.get(key))){states.set(key,'preserved');reasons.set(key,reason);changed=true;}};
  for(const [key,{entity,current}] of desired){
   if(['updated','added'].includes(states.get(key))&&refs(entity).some(([type,id])=>{
    const ref=keyOf(type,id);return type==='sources'&&states.get(ref)==='preserved'||!store.get(type,id)&&!['added','updated'].includes(states.get(ref));
   }))preserve(key,'preserved_evidence_or_missing_reference');
   if(states.get(key)==='preserved'&&current)for(const [type,id] of refs(current))if(type==='sources')preserve(keyOf(type,id),'evidence_of_preserved_record');
  }
 }
 const profile=store.meta('profile'),profileKnown=[baseline.seed.profile,baseline.gitHeadSeed.profile,engineerBaseline.seed.profile,...engineerBaseline.installed.map(item=>item.profile),caspianBaseline.seed.profile,...caspianBaseline.installed.map(item=>item.profile)].some(template=>matches(profile,template));
 store.transaction(()=>{
  if(profileKnown)store.setMeta('profile',data.profile);
  for(const collection of collections)for(const [key,item] of desired){
   if(item.collection!==collection)continue;
   let state=states.get(key);
   if(['updated','added'].includes(state)&&refs(item.entity).some(([type,id])=>!store.get(type,id))){state='preserved';states.set(key,state);reasons.set(key,'missing_reference');}
   if(state==='updated'||state==='added'){
    // Preserve original creation time; authored content is replaced only after a full hash match.
    const entity={...item.entity,...(item.current?.createdAt?{createdAt:item.current.createdAt}:{})};
    if(collection==='facts'&&item.current){
     entity.version=item.current.version+1;
     entity.history=[...item.current.history,{...item.entity.history.at(-1),version:entity.version,recordedAt:stamp,reason:'演示资料更新为万叶（Caspian）的工作与生活，旧版默认内容保存在基线存档。'}];
    }
    store.put(collection,entity);
    report[state].push({collection,id:entity.id,...(item.current?{beforeHash:demoRecordHash(item.current)}:{}),afterHash:demoRecordHash(entity)});
   }else {report[state].push({collection,id:item.entity.id,...(state==='preserved'?{reason:reasons.get(key)}:{})});if(state==='preserved')report.preservedReasons[reasons.get(key)]=(report.preservedReasons[reasons.get(key)]??0)+1;}
  }
  const versions=store.get('meta','demo-migrations')?.value?.versions??[];
  store.setMeta('demo-migrations',{versions:[...new Set([...versions,2,4,5,6])],appliedAt:stamp});
  store.setMeta('demo-life-v3',{...(store.get('meta','demo-life-v3')?.value??{}),appliedAt:stamp});
  store.setMeta(marker,report);
 });
}
