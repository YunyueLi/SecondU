export const GUIDE_VERSION=4;
const progressKey='hither.product-guide.v4';
const ids=['vision','cognition','life','experts','projects','devices','world','history'];
export function readGuideProgress(){
 try{const value=JSON.parse(globalThis.localStorage.getItem(progressKey)||'null');return {index:Number.isInteger(value?.index)?Math.max(0,Math.min(7,value.index)):0,seen:value?.version===GUIDE_VERSION&&value?.seen===true,completed:value?.version===GUIDE_VERSION&&Array.isArray(value?.completed)?ids.filter(id=>value.completed.includes(id)):[]};}
 catch{return {index:0,seen:false,completed:[]};}
}
export function hasSeenProductGuide(){return readGuideProgress().seen;}
export function saveGuideProgress(index,seen,completed=readGuideProgress().completed){
 try{globalThis.localStorage.setItem(progressKey,JSON.stringify({version:GUIDE_VERSION,index,seen,completed}));}catch{/* Local preferences are optional. */}
}
export function completeGuideChapter(id){const current=readGuideProgress();const completed=ids.filter(chapter=>chapter===id||current.completed.includes(chapter));saveGuideProgress(current.index,current.seen,completed);return completed;}
