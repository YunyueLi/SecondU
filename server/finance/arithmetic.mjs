import {createHash} from 'node:crypto';
import {HttpError} from '../http-error.mjs';

export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const CURRENCIES=new Set(['CNY','CNH','USD','HKD','SGD','EUR','GBP','JPY','AUD','CAD','CHF','NZD','KRW','MYR','TWD','INR','THB']);
export const fail=(message,code='finance_invalid_input',status=400)=>{throw new HttpError(status,message,code);};
export function currency(value){if(!CURRENCIES.has(value))fail('请选择支持的币种。','finance_invalid_currency');return value;}
export function decimal(value,{signed=false,places=18}={}){
  if(typeof value!=='string'||!(new RegExp(`^${signed?'-?':''}(?:0|[1-9]\\d{0,14})(?:\\.\\d{1,${places}})?$`)).test(value))fail('金额或数量须为有效的十进制字符串。','finance_invalid_decimal');
  const normalized=value.includes('.')?value.replace(/0+$/,'').replace(/\.$/,''):value;
  return /^-?0$/.test(normalized)?'0':normalized;
}
export function fraction(value){const negative=String(value).startsWith('-'),[whole,tail='']=String(value).replace(/^-/,'').split('.');return {n:BigInt(whole+tail)*(negative?-1n:1n),d:10n**BigInt(tail.length)};}
export function fixed(n,d=100n){const sign=n<0n?'-':'',a=n<0n?-n:n,rounded=(a*200n+d)/(2n*d);return `${sign}${rounded/100n}.${String(rounded%100n).padStart(2,'0')}`;}
export function money(value,{signed=false}={}){const v=decimal(value,{signed,places:2}),f=fraction(v);return fixed(f.n,f.d);}
export function minor(value){const f=fraction(value);return f.n*100n/f.d;}
export function sum(rows){return fixed(rows.reduce((total,row)=>total+minor(row),0n));}
export function multiply(left,right){const a=fraction(left),b=fraction(right);return fixed(a.n*b.n,a.d*b.d);}
export function date(value,now=Date.now()){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))fail('日期须为 YYYY-MM-DD 或带时区的 ISO 时间。','finance_invalid_date');
  const day=value.slice(0,10),stamp=Date.parse(value),dateStamp=Date.parse(day+'T00:00:00Z');
  if(!Number.isFinite(stamp)||!Number.isFinite(dateStamp)||new Date(dateStamp).toISOString().slice(0,10)!==day||(value.length>10&&(Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59))||stamp>Number(now)+86400000)fail('记录日期无效或晚于当前日期。','finance_invalid_date');
  return value;
}
export function text(value,label,max=200,optional=false){if(optional&&(value===undefined||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail(`${label}无效或过长。`);return value.trim();}
export function fields(input,allowed){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))fail('请求包含未支持的字段。');return input;}
export function operationKey(value){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{7,127}$/.test(value))fail('请提供 8—128 位更新标识。','finance_invalid_key');return value;}
export function baseMarker(account){return digest({id:account.id,amount:account.amount,currency:account.currency,asOf:account.asOf,updatedAt:account.updatedAt});}

// Rates are units of CNY per one source-currency unit. Missing conversions stay
// unknown; they are never included as zero in a supposedly complete total.
export function valuation(accounts,liabilities,displayCurrency,rates=[]){
  const byCurrency=new Map([['CNY',{currency:'CNY',rate:'1',baseCurrency:'CNY',asOf:null,sourceName:'原币',sourceUrl:null}]]);
  for(const row of rates){if(row?.baseCurrency&&row.baseCurrency!=='CNY')continue;try{const rate=decimal(row.rate),f=fraction(rate);if(f.n>0n&&CURRENCIES.has(row.currency))byCurrency.set(row.currency,{...row,rate,baseCurrency:'CNY'});}catch{}}
  const convert=(amount,from)=>{
    if(from===displayCurrency)return money(amount,{signed:true});
    const source=byCurrency.get(from),target=byCurrency.get(displayCurrency);if(!source||!target)return null;
    const a=fraction(amount),s=fraction(source.rate),t=fraction(target.rate);return fixed(a.n*s.n*t.d,a.d*s.d*t.n);
  };
  const projected=[...accounts.map(row=>({...row,kind:'asset'})),...liabilities.map(row=>({...row,kind:'liability'}))].map(row=>({accountId:row.id,kind:row.kind,currency:row.currency,originalAmount:row.amount,amount:convert(row.amount,row.currency),baseCurrency:displayCurrency}));
  const assetsRows=projected.filter(row=>row.kind==='asset'),liabilityRows=projected.filter(row=>row.kind==='liability');
  const assetsComplete=assetsRows.every(row=>row.amount!==null),liabilitiesComplete=liabilityRows.every(row=>row.amount!==null),complete=assetsComplete&&liabilitiesComplete;
  const partialAssets=sum(assetsRows.filter(row=>row.amount!==null).map(row=>row.amount)),partialLiabilities=sum(liabilityRows.filter(row=>row.amount!==null).map(row=>row.amount));
  return {currency:displayCurrency,baseCurrency:displayCurrency,assets:assetsComplete?partialAssets:null,liabilities:liabilitiesComplete?partialLiabilities:null,net:complete?fixed(minor(partialAssets)-minor(partialLiabilities)):null,partialAssets,partialLiabilities,complete,conversionComplete:complete,assetsComplete,liabilitiesComplete,unconvertedCurrencies:[...new Set(projected.filter(row=>row.amount===null).map(row=>row.currency))],convertedAccounts:projected,rates:[...byCurrency.values()],asOf:rates.map(row=>row.asOf).filter(Boolean).sort()[0]||null,issue:complete?null:{code:'FX_UNAVAILABLE',message:'部分币种尚无有效汇率，跨币种合计暂不完整。'}};
}
