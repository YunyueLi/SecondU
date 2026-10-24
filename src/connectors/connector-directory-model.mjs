import {CONNECTOR_CATALOG,CONNECTOR_CATEGORIES,FINANCE_CONNECTOR_CATALOG} from '../../shared/connector-catalog.mjs';

// Editorial starting points, not usage rankings or claims about popularity.
const COMMON_SERVICE_IDS=['gmail','google-drive','notion','github','slack','google-calendar'];
const allServices=[...FINANCE_CONNECTOR_CATALOG,...CONNECTOR_CATALOG];
const categoryName=id=>CONNECTOR_CATEGORIES.find(category=>category.id===id);
const matches=(service,query)=>{
 const category=categoryName(service.category);
 return `${service.name} ${service.description} ${service.descriptionEn} ${category?.zh||''} ${category?.en||''}`.toLowerCase().includes(query);
};

export function connectorDirectorySections({category='all',query=''}={}){
 const search=query.trim().toLowerCase();
 const filtered=allServices.filter(service=>(category==='all'||service.category===category)&&matches(service,search));
 if(search)return filtered.length?[{id:'search',zh:'搜索结果',en:'Search results',services:filtered}]:[];
 if(category!=='all'){
  const label=categoryName(category);
  return filtered.length?[{id:category,zh:label?.zh||category,en:label?.en||category,services:filtered}]:[];
 }
 const common=COMMON_SERVICE_IDS.map(id=>allServices.find(service=>service.id===id)).filter(Boolean);
 const chosen=new Set(COMMON_SERVICE_IDS);
 return [
  {id:'common',zh:'常用服务',en:'Common services',services:common},
  ...CONNECTOR_CATEGORIES.filter(item=>item.id!=='all').map(item=>({
   id:item.id,zh:item.zh,en:item.en,services:allServices.filter(service=>service.category===item.id&&!chosen.has(service.id)),
  })),
 ].filter(section=>section.services.length);
}
