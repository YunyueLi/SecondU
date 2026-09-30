import type {PortraitKind, FactStatus, PortraitEntry} from '../../shared/contracts';
import {t} from '../i18n.ts';
export const portraitKinds:PortraitKind[]=['identity','background','preference','experience','goal','boundary','note'];
export const portraitKindLabel=(kind:PortraitKind)=>({identity:t('身份与角色','Identity and roles'),background:t('个人背景','Background'),preference:t('偏好与习惯','Preferences'),experience:t('重要经历','Experiences'),goal:t('目标与计划','Goals'),boundary:t('边界与约束','Boundaries'),note:t('其他观察','Other observations')}[kind]);
export const portraitStatusLabel=(status:FactStatus)=>({candidate:t('待确认','Unconfirmed'),inferred:t('推测','Inferred'),confirmed:t('已确认','Confirmed'),superseded:t('已失效','Superseded')}[status]);
export const portraitDraft=(entries:PortraitEntry[])=>({schema:'hither.person.v1' as const,entries});

const entryFields=new Set(['id','kind','statement','status','sourceIds','privacy','recordedAt','validFrom','validTo','note']);
function validDate(value:string){
  if(!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  if(year<1||year>9999||month!==undefined&&(month<1||month>12))return false;
  if(day===undefined)return true;
  const days=[31,(year%4===0&&year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return day>=1&&day<=days[month-1];
}

// Reject invalid JSON before replacing the form draft. The server remains the
// authority for timestamps, version history and concurrent updates.
export function parsePortraitDraft(raw:string,sources:Array<{id:string}>):PortraitEntry[]{
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw new Error(t('JSON 格式有误，请检查引号与逗号。','Invalid JSON. Check quotation marks and commas.'));}
  if(!value||typeof value!=='object'||Array.isArray(value)||!('schema' in value)||value.schema!=='hither.person.v1'||!('entries' in value)||!Array.isArray(value.entries)||value.entries.length>100)throw new Error(t('请保留 schema 和最多 100 项的 entries 数组。','Keep the schema and an entries array with at most 100 items.'));
  const ids=new Set<string>(),knownSources=new Set(sources.map(source=>source.id)),allSources=new Set<string>();
  return value.entries.map((row:unknown,index:number)=>{
    const fail=(zh:string,en:string):never=>{throw new Error(t(`第 ${index+1} 条：${zh}`,`Entry ${index+1}: ${en}`));};
    if(!row||typeof row!=='object'||Array.isArray(row))return fail('画像条目必须是对象。','Profile entries must be objects.');
    const data=row as Record<string,unknown>;
    if(Object.keys(data).some(key=>!entryFields.has(key)))return fail('含有不支持的字段。','Contains an unsupported field.');
    const text=(key:string,max:number,optional=false):string|undefined=>{
      const input=data[key];
      if(optional&&(input===undefined||input===''))return undefined;
      if(typeof input!=='string'||!input.trim()||input.length>max)return fail(`${key} 必须是非空文本，最多 ${max} 字。`,`${key} must be nonempty text with at most ${max} characters.`);
      return input.trim();
    };
    const id=text('id',200)!;
    if(ids.has(id))return fail('条目 ID 不能重复。','Entry IDs must be unique.');
    ids.add(id);
    if(!portraitKinds.includes(data.kind as PortraitKind))return fail('画像分类无效。','Invalid profile category.');
    if(!['candidate','confirmed','inferred','superseded'].includes(data.status as string))return fail('确认状态无效。','Invalid confirmation status.');
    if(!['private','sensitive'].includes(data.privacy as string))return fail('隐私标记无效。','Invalid privacy label.');
    if(!Array.isArray(data.sourceIds)||data.sourceIds.length>50||data.sourceIds.some(id=>typeof id!=='string'||!knownSources.has(id)))return fail('请选择已有来源，每条最多 50 个。','Choose existing sources, at most 50 per entry.');
    const sourceIds=[...new Set(data.sourceIds as string[])];
    sourceIds.forEach(id=>allSources.add(id));
    if(allSources.size>200)return fail('一份画像最多关联 200 个来源。','A profile may reference at most 200 sources.');
    const validFrom=text('validFrom',10,true),validTo=text('validTo',10,true),note=text('note',2000,true);
    if(validFrom&&!validDate(validFrom)||validTo&&!validDate(validTo))return fail('时效须为有效年份、月份或日期。','Dates must be valid years, months or dates.');
    const fullDate=(date:string)=>date.length===4?`${date}-01-01`:date.length===7?`${date}-01`:date;
    if(validFrom&&validTo&&fullDate(validFrom)>fullDate(validTo))return fail('结束日期不能早于开始日期。','The end date cannot precede the start date.');
    return {id,kind:data.kind as PortraitKind,statement:text('statement',5000)!,status:data.status as FactStatus,sourceIds,privacy:data.privacy as PortraitEntry['privacy'],recordedAt:typeof data.recordedAt==='string'?data.recordedAt:new Date().toISOString(),...(validFrom?{validFrom}:{}),...(validTo?{validTo}:{}),...(note?{note}:{})};
  });
}
