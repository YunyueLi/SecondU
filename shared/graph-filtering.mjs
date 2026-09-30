const categories = [
  {id:'family',label:'家人',labelEn:'Family',color:'#be9144'},
  {id:'friends',label:'朋友',labelEn:'Friends',color:'#52886d'},
  {id:'classmates',label:'同学',labelEn:'Classmates',color:'#6687b7'},
  {id:'colleagues',label:'同事',labelEn:'Colleagues',color:'#8071b0'},
  {id:'mentors',label:'老师与导师',labelEn:'Teachers and mentors',color:'#b37888'},
  {id:'contacts',label:'微信联系人',labelEn:'WeChat contacts',color:'#88949d'},
];
// These are complete, explicitly recorded relationship/role labels. Background
// prose, company names and school names never establish a relationship category.
const labels = new Map();
function register(category, values){for(const value of values){const key=normalize(value);labels.set(key,[...new Set([...(labels.get(key)||[]),category])]);}}
register('family',['家人','家庭','父亲','母亲','父母','姐姐','妹妹','哥哥','弟弟','配偶','丈夫','妻子','儿子','女儿','family','father','mother','parent','sibling','spouse','younger sister']);
register('friends',['朋友','长期朋友','长期密友','密友','童年朋友','小学与童年朋友','行业朋友','社区朋友','朋友与前同事','前同事与朋友','密友与前同事','长期朋友与同学','高中同学与长期朋友','朋友与 AI 职业导师','朋友与AI职业导师','friend','friends','close friend','long-term friend and classmate','high school classmate and long-term friend']);
register('classmates',['同学','小学同学','初中同学','高中同学','中学同学','大学同学','长期朋友与同学','高中同学与长期朋友','classmate','classmates','long-term friend and classmate','high school classmate and long-term friend']);
register('colleagues',['同事','长期同事','前同事','前主管','主管','朋友与前同事','前同事与朋友','密友与前同事','前同事与技术导师','导师与前同事','亲密关系与前同事','colleague','colleagues','former colleague','manager']);
register('mentors',['老师','教师','导师','技术导师','职业导师','大学教师','前同事与技术导师','导师与前同事','朋友与 AI 职业导师','朋友与AI职业导师','teacher','mentor']);
register('contacts',['微信联系人','微信往来','wechat contact']);

function normalize(value){return String(value||'').normalize('NFKC').trim().toLocaleLowerCase();}
function explicitCategories(value){return labels.get(normalize(value))||[];}
function provenanceKind(source){
  // Import provenance is a structured header, not a keyword in the source body.
  const marker='\n本机来源与处理记录\n';const start=source.text?.indexOf(marker);
  if(start>=0&&start<1000){const end=source.text.indexOf('\n\n',start+marker.length);if(end>0&&end-start<16000){
    try{const metadata=JSON.parse(source.text.slice(start+marker.length,end));
      if(metadata.importBatch==='people-graph-20260930'){
        if(metadata.record==='subject'||String(metadata.record).startsWith('canonical-'))return 'documented';
        if(String(metadata.record).startsWith('contact-history-'))return 'communication';
      }
    }catch{/* Non-imported source text remains ordinary evidence. */}
  }}
  if(source.kind==='conversation'||source.import)return 'communication';
  return 'other';
}

export function buildGraphFilterIndex({people=[],relationships=[],sources=[],selfPersonId}={}){
  const peopleById=new Map(people.map(person=>[person.id,person]));
  const selfId=selfPersonId?(peopleById.has(selfPersonId)?selfPersonId:undefined):peopleById.has('person-self')?'person-self':undefined;
  const validRelationships=relationships.filter(item=>peopleById.has(item.from)&&peopleById.has(item.to));
  const sourceKinds=new Map(sources.map(source=>[source.id,provenanceKind(source)]));
  const personCategories=new Map(),personSources=new Map(),searchText=new Map(),personCircles=new Map();
  for(const person of people){
    const assigned=new Set(explicitCategories(person.role));
    // Separators join explicit roles, e.g. "长期朋友 · 产品反馈". No substring
    // matching is allowed inside ambiguous labels such as "老师和同学".
    for(const part of String(person.role||'').split(/\s*[·；;]\s*/))for(const category of explicitCategories(part))assigned.add(category);
    personCategories.set(person.id,assigned);
    const kinds=new Set((person.sourceIds||[]).map(id=>sourceKinds.get(id)).filter(Boolean));
    if(kinds.has('documented'))personSources.set(person.id,['documented']);
    else if(kinds.has('communication'))personSources.set(person.id,['communication']);
    else personSources.set(person.id,['other']);
    searchText.set(person.id,normalize(`${person.name} ${person.role||''} ${person.description||''}`));
    const role=String(person.role||'').trim();personCircles.set(person.id,role&&person.id!==selfId?[role]:[]);
  }
  // A relationship between two other people does not establish either person's
  // relationship with the profile owner. Only owner edges contribute categories.
  if(selfId)for(const relation of validRelationships){
    const other=relation.from===selfId?relation.to:relation.to===selfId?relation.from:undefined;
    if(other&&other!==selfId)for(const category of explicitCategories(relation.label))personCategories.get(other).add(category);
  }
  if(selfId)personCategories.set(selfId, new Set());
  const categoryArrays=new Map([...personCategories].filter(([id])=>id!==undefined).map(([id,values])=>[id,[...values]]));
  const circleCounts=new Map();for(const values of personCircles.values())for(const value of values)circleCounts.set(value,(circleCounts.get(value)||0)+1);
  return {
    people,relationships:validRelationships,peopleById,selfPersonId:selfId,personCategories:categoryArrays,personSources,personCircles,searchText,
    categories:categories.map(category=>({...category,count:[...categoryArrays.values()].filter(values=>values.includes(category.id)).length})),
    sources:[{id:'documented',label:'已建档人物',labelEn:'Documented people'},{id:'communication',label:'通信联系人',labelEn:'Communication contacts'},{id:'other',label:'其他来源',labelEn:'Other sources'}].map(source=>({...source,count:[...personSources.values()].filter(values=>values.includes(source.id)).length})),
    circles:[...circleCounts].map(([id,count])=>({id,label:id,labelEn:id,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)),
  };
}

export function filterGraph(index,{query='',category='all',source='all',relationship='all',circle='all',showOrphans=true,focused}={}){
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  const candidateRelations=index.relationships.filter(item=>relationship==='all'||item.label===relationship);
  const related=new Set(candidateRelations.flatMap(item=>[item.from,item.to]));
  const local=focused?new Set([focused,...candidateRelations.filter(item=>item.from===focused||item.to===focused).flatMap(item=>[item.from,item.to])]):undefined;
  const matches=index.people.filter(person=>
    (!terms.length||terms.every(term=>index.searchText.get(person.id).includes(term)))&&
    (category==='all'||index.personCategories.get(person.id)?.includes(category))&&
    (source==='all'||index.personSources.get(person.id)?.includes(source))&&
    (circle==='all'||index.personCircles.get(person.id)?.includes(circle))&&
    (relationship==='all'||related.has(person.id))&&(!local||local.has(person.id))
  );
  const visibleIds=new Set(matches.map(person=>person.id));
  // Retain the actual profile owner as an anchor only when a matching person has
  // an existing owner edge. A failed query must remain empty, never show "self".
  const self=index.selfPersonId;
  if(self&&(!local||local.has(self))&&!visibleIds.has(self)&&candidateRelations.some(item=>(item.from===self&&visibleIds.has(item.to))||(item.to===self&&visibleIds.has(item.from))))visibleIds.add(self);
  const visibleRelations=candidateRelations.filter(item=>visibleIds.has(item.from)&&visibleIds.has(item.to));
  if(!showOrphans){const connected=new Set(visibleRelations.flatMap(item=>[item.from,item.to]));for(const id of visibleIds)if(!connected.has(id))visibleIds.delete(id);}
  return {visibleIds,visibleRelations,matches:matches.filter(person=>visibleIds.has(person.id))};
}
