const DAY=86400000;
export const dayStamp=day=>Date.parse(day+'T00:00:00Z');
export const addDays=(day,count)=>{const iso=new Date(dayStamp(day)+count*DAY).toISOString();return /^\d{4}-/.test(iso)?iso.slice(0,10):null;};
export function monthAt(month,offset){const [y,m]=month.split('-').map(Number),index=y*12+m-1+offset,year=Math.floor(index/12);return `${String(year).padStart(4,'0')}-${String(index-year*12+1).padStart(2,'0')}`;}
export function daysInMonth(month){const [year,n]=month.split('-').map(Number),date=new Date(0);date.setUTCFullYear(year,n,0);return date.getUTCDate();}
function anchoredMonth(anchor,offset){
  const month=monthAt(anchor.slice(0,7),offset);if(month.length!==7)return null;
  return `${month}-${String(Math.min(Number(anchor.slice(8)),daysInMonth(month))).padStart(2,'0')}`;
}
export function occurrenceAt(row,index){
  if(row.frequency==='once')return index===0?row.anchorDate:null;
  const interval=row.interval??1;
  if(row.frequency==='weekly')return addDays(row.anchorDate,index*interval*7);
  return anchoredMonth(row.anchorDate,index*interval*({monthly:1,quarterly:3,yearly:12}[row.frequency]));
}
export function firstIndex(row,from){
  if(row.frequency==='once'||from<=row.anchorDate)return 0;
  if(row.frequency==='weekly')return Math.max(0,Math.floor((dayStamp(from)-dayStamp(row.anchorDate))/(DAY*7*(row.interval??1))));
  const [ay,am]=row.anchorDate.slice(0,7).split('-').map(Number),[fy,fm]=from.slice(0,7).split('-').map(Number);
  return Math.max(0,Math.floor(((fy-ay)*12+fm-am)/((row.interval??1)*({monthly:1,quarterly:3,yearly:12}[row.frequency]))));
}
/** Calculate from the original anchor so January 31 does not drift after February. */
export function recurringOccurrences(row,from,through){
  const result=[];
  for(let index=firstIndex(row,from);;index++){
    const date=occurrenceAt(row,index);
    if(!date||date>through||row.endDate&&date>row.endDate)break;
    if(date>=from)result.push(date);
  }
  return result;
}
export function isRecurringOccurrence(row,date){return date>=row.anchorDate&&(!row.endDate||date<=row.endDate)&&recurringOccurrences(row,date,date).length===1;}
