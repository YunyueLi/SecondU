import {t, useLocale, getLocale} from '../i18n';
import {useId,useState,type CSSProperties} from 'react';
import {money} from './model';
import {FinanceIcon} from './FinanceIcon';
import './finance-charts.css';

export type FinanceChartPoint={label:string;value:string|null};
export type FinanceChartSeries={name:string;points:FinanceChartPoint[];comparison?:boolean};

/** Geometry alone uses floating point. Labels retain the original decimal strings. */
export function FinanceTrend({series,currency,hidden=false,label,formatValue=money,domain}:{series:FinanceChartSeries[];currency:string;hidden?:boolean;label:string;formatValue?:(value:string)=>string;domain?:{min:number;max:number}}){
  useLocale();
  const id=useId(),[active,setActive]=useState<number|null>(null);
  const count=Math.max(0,...series.map(row=>row.points.length));
  const values=series.flatMap(row=>row.points.map(point=>point.value===null?null:Number(point.value))).filter((value):value is number=>value!==null&&Number.isFinite(value));
  if(hidden)return <div className="finance-chart-hidden" aria-label={t(`${label}，金额已隐藏`, `${label}, amounts hidden`)}>{t("金额已隐藏", "Amounts hidden")}</div>;
  if(!values.length)return <div className="finance-chart-empty">{t("暂无记录", "No records yet")}</div>;
  const validDomain=domain&&Number.isFinite(domain.min)&&Number.isFinite(domain.max)&&domain.max>domain.min?domain:null;
  const minimum=validDomain?.min??Math.min(0,...values),maximum=validDomain?.max??Math.max(...values,minimum+1),span=maximum-minimum;
  const x=(index:number)=>24+(count===1?236:index/Math.max(count-1,1)*472);
  const y=(value:string)=>164-(Number(value)-minimum)/span*144;
  const path=(points:FinanceChartPoint[])=>{let start=true;return points.map((point,index)=>{if(point.value===null){start=true;return '';}const segment=`${start?'M':'L'}${x(index)},${y(point.value)}`;start=false;return segment;}).join(' ');};
  const selected=active===null?null:series.map(row=>({name:row.name,point:row.points[active]})).filter(row=>row.point?.value!==null&&row.point?.value!==undefined);
  const labels=series.find(row=>row.points.length===count)?.points||[];
  return <div className="finance-trend">
    <div className="finance-chart-legend">{series.map(row=><span key={row.name}><i className={row.comparison?'is-comparison':''}/>{row.name}</span>)}</div>
    <div className="finance-chart-plot">
      <svg viewBox="0 0 520 194" role="group" aria-label={label} aria-describedby={id}>
        {[0,.5,1].map(step=><line key={step} x1="24" x2="496" y1={20+144*step} y2={20+144*step} className="finance-chart-grid"/>)}
        {series.map(row=><g key={row.name} className={row.comparison?'finance-chart-series is-comparison':'finance-chart-series'}><path d={path(row.points)}/>{!row.comparison&&row.points.map((point,index)=>point.value===null?null:<circle key={index} cx={x(index)} cy={y(point.value)} r={active===index?5:3} tabIndex={0} role="button" aria-label={t(`${point.label}，${formatValue(point.value)} ${currency}`, `${point.label}, ${formatValue(point.value)} ${currency}`)} onPointerEnter={()=>setActive(index)} onPointerLeave={()=>setActive(null)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)} onKeyDown={event=>{if(event.key==='Escape')setActive(null);}}/>)}</g>)}
        <text x="24" y="188">{labels[0]?.label}</text><text x="496" y="188" textAnchor="end">{labels.at(-1)?.label}</text>
      </svg>
      {selected&&<div className="finance-chart-tooltip" role="status"><strong>{labels[active!]?.label}</strong>{selected.map(row=><span key={row.name}>{row.name}<b>{formatValue(row.point.value!)} {currency}</b></span>)}</div>}
    </div>
    <details className="finance-chart-data" id={id}><summary>{t("查看数据", "View data")}</summary><div className="finance-chart-data-scroll"><table><thead><tr><th>{t("日期", "Date")}</th>{series.map(row=><th key={row.name}>{t(`${row.name}（${currency}）`, `${row.name} (${currency})`)}</th>)}</tr></thead><tbody>{labels.map((point,index)=><tr key={index}><td>{point.label}</td>{series.map(row=><td key={row.name}>{row.points[index]?.value==null?'—':formatValue(row.points[index].value!)}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

export type FinanceCategoryValue={id:string;name:string;amount:string|null;count:number;byCurrency?:Record<string,string>;complete?:boolean};
const chartColors=['green-600','green-500','green-400','blue-400','blue-500','purple-500','orange-500','pink-500'] as const;
const categoryColors:Record<string,typeof chartColors[number]>={housing:'green-600',food:'green-500',travel:'green-400',education:'blue-400',shopping:'blue-500',transport:'purple-500',health:'pink-500',entertainment:'orange-500'};
function categoryColor(id:string){
  let hash=0;for(const character of id)hash=(hash*31+character.charCodeAt(0))>>>0;
  return `var(--${categoryColors[id]||chartColors[hash%chartColors.length]})`;
}
function categoryMinor(value:string|null){
  const match=value?.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if(!match)return null;
  return (match[1]?-1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));
}
export function FinanceCategoryBars({rows,currency,hidden=false,onSelect}:{rows:FinanceCategoryValue[];currency:string;hidden?:boolean;onSelect?:(id:string)=>void}){
  useLocale();
  const [expanded,setExpanded]=useState(false),listId=useId();
  const values=rows.map(row=>({row,value:row.complete===false?null:categoryMinor(row.amount)}));
  const sorted=[...values].sort((a,b)=>{
    if(!hidden){
      if(a.value===null&&b.value!==null)return 1;
      if(a.value!==null&&b.value===null)return -1;
      if(a.value!==null&&b.value!==null&&a.value!==b.value)return a.value>b.value?-1:1;
    }
    return a.row.name.localeCompare(b.row.name,getLocale())||a.row.id.localeCompare(b.row.id);
  });
  const positive=sorted.filter((item):item is {row:FinanceCategoryValue;value:bigint}=>item.value!==null&&item.value>0n);
  const total=positive.reduce((sum,item)=>sum+item.value,0n),maximum=positive[0]?.value||0n;
  const visible=expanded?sorted:sorted.slice(0,5);
  const incomplete=values.some(item=>item.value===null),refunds=values.some(item=>item.value!==null&&item.value<0n);
  const fraction=(value:bigint,base:bigint)=>base>0n?Number(value*1_000_000n/base)/1_000_000:0;
  const renderRow=({row,value}:{row:FinanceCategoryValue;value:bigint|null})=>{
    const originals=Object.entries(row.byCurrency||{}).filter(([,amount])=>categoryMinor(amount)!==null).sort(([a],[b])=>a.localeCompare(b));
    const amountEntries=value===null?originals:[[currency,row.amount!]];
    const content=<><span className="finance-category-icon"><FinanceIcon kind={row.id}/></span><span className="finance-category-content"><span className="finance-category-main"><span className="finance-category-name">{row.name}</span><span className="finance-category-amount">{amountEntries.length?amountEntries.map(([code,amount])=><span key={code}><strong>{money(amount,hidden)}</strong><small>{code}</small></span>):<strong>{hidden?'••••':'—'}</strong>}</span></span>{!hidden&&value!==null&&value>0n?<span className="finance-category-bar" aria-hidden="true"><span style={{width:`${fraction(value,maximum)*100}%`}}/></span>:<span className="finance-category-meta">{value===null?t("待折算", "Conversion pending"):!hidden&&value<0n?t("净退款", "Net refund"):t(`${row.count} 笔记录`, `${row.count} records`)}</span>}</span></>;
    const style={'--finance-category-color':categoryColor(row.id)} as CSSProperties;
    return <li key={row.id}>{onSelect?<button type="button" className="finance-category-row" style={style} onClick={()=>onSelect(row.id)}>{content}</button>:<div className="finance-category-row" style={style}>{content}</div>}</li>;
  };
  return <div className="finance-category-chart">
    {!hidden&&total>0n&&<><div className="finance-category-stack" aria-hidden="true">{positive.map(({row,value})=><span key={row.id} style={{flexGrow:fraction(value,total),background:categoryColor(row.id)}}/>)}</div>{(incomplete||refunds)&&<p className="finance-category-scope">{incomplete?t("占比仅含已折算的正值支出", "Shares include converted positive expenses only"):t("占比按正值支出计算", "Shares are based on positive expenses")}</p>}</>}
    <ul id={listId} className="finance-category-list">{visible.map(renderRow)}</ul>
    {rows.length>5&&<button type="button" className="finance-chart-show-more" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(!expanded)}>{expanded?t("收起", "Show less"):t(`显示全部 ${rows.length} 个类别`, `Show all ${rows.length} categories`)}</button>}
  </div>;
}
