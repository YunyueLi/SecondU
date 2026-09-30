// Keep the precision the person supplied; do not invent a month or day.
export function validLifeDate(value) {
  if(typeof value!=='string'||!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number);
  if(y<1||y>9999||m!==undefined&&(m<1||m>12))return false;
  if(d===undefined)return true;
  const days=[31,(y%4===0&&y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return d>=1&&d<=days[m-1];
}
export function lifeDateStart(value){return `${value}${value.length===4?'-01-01':value.length===7?'-01':''}`;}
