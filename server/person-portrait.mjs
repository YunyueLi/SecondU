import {HttpError, id, now} from './store.mjs';
import {validLifeDate,lifeDateStart} from './life-date.mjs';
const kinds=['identity','background','preference','experience','goal','boundary','note'];
const statuses=['candidate','inferred','confirmed','superseded'];
function fail(message){throw new HttpError(400,message,'invalid_portrait');}
function string(value,field,max,optional=false){if(optional&&(value===undefined||value===''))return undefined;if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${field} 无效或过长`);return value.trim();}
export function portraitSourceIds(portrait){return [...new Set([...portrait.entries,...portrait.history.flatMap(h=>h.entries)].flatMap(e=>e.sourceIds))];}
export function updatePersonPortrait(store,body,previous){
  if(body.portrait===undefined)return previous;
  const raw=body.portrait;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.schema!=='hither.person.v1')fail('画像须使用 hither.person.v1 对象。');
  if(previous&&body.basePortraitVersion!==previous.version)throw new HttpError(409,'人物画像已更新，请重新打开后再修改。','portrait_version_conflict');
  if(!previous&&body.basePortraitVersion!==undefined&&body.basePortraitVersion!==0)throw new HttpError(409,'人物画像版本不匹配，请重新打开后再修改。','portrait_version_conflict');
  if(!Array.isArray(raw.entries)||raw.entries.length>100)fail('画像条目必须是数组，最多 100 项。');
  const stamp=now(),seen=new Set();
  const entries=raw.entries.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))fail('画像条目必须是对象。');
    if(Object.keys(row).some(key=>!['id','kind','statement','status','sourceIds','privacy','recordedAt','validFrom','validTo','note'].includes(key)))fail('画像条目含不支持的字段，请按规范编辑。');
    const key=row.id===undefined?id('portrait'):string(row.id,'entry.id',200);
    if(seen.has(key))fail('画像条目 ID 不能重复。');seen.add(key);
    if(!kinds.includes(row.kind))fail('画像条目分类无效。');
    const status=row.status??'candidate';if(!statuses.includes(status))fail('画像条目状态无效。');
    const privacy=row.privacy??'private';if(!['private','sensitive'].includes(privacy))fail('画像只支持本地私密或敏感标记，不代表公开授权。');
    if(!Array.isArray(row.sourceIds)||row.sourceIds.length>50||row.sourceIds.some(x=>typeof x!=='string'))fail('画像来源须是有效来源标识列表。');
    const sourceIds=[...new Set(row.sourceIds)];for(const sourceId of sourceIds)store.require('sources',sourceId);
    const validFrom=string(row.validFrom,'validFrom',10,true),validTo=string(row.validTo,'validTo',10,true);
    if(validFrom&&!validLifeDate(validFrom)||validTo&&!validLifeDate(validTo))fail('画像时效须为有效年份、月份或日期。');
    if(validFrom&&validTo&&lifeDateStart(validFrom)>lifeDateStart(validTo))fail('画像结束日期不能早于开始日期。');
    const note=string(row.note,'note',2000,true),old=previous?.entries.find(entry=>entry.id===key);
    return {id:key,kind:row.kind,statement:string(row.statement,'statement',5000),status,sourceIds,privacy,recordedAt:old?.recordedAt??stamp,...(validFrom?{validFrom}:{}),...(validTo?{validTo}:{}),...(note?{note}:{})};
  });
  const allSources=new Set([...entries,...(previous?.history??[]).flatMap(revision=>revision.entries)].flatMap(entry=>entry.sourceIds));
  if(allSources.size>200)fail('一份人物画像最多关联 200 个来源（含历史记录）。');
  const version=(previous?.version??0)+1;
  return {schema:'hither.person.v1',version,updatedAt:stamp,entries,history:[...(previous?.history??[]),{version,recordedAt:stamp,entries:structuredClone(entries)}]};
}
