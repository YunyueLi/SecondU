import {useId,useState,type CSSProperties} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {BrandIcon} from './BrandIcon';
import {FinanceIcon} from './FinanceIcon';
import {t} from '../i18n';
import './AllocationDonut.css';

export type AllocationGroup={id:string;name:string;color:string;amount:bigint;accounts?:ReadonlyArray<{currency?:string}>;assetType?:string;subtitle?:string};
type Props={groups:readonly AllocationGroup[];currency:string;hidden:boolean;onSelect:(id:string,accountCurrency?:string)=>void;label?:string;embedded?:boolean};
const money=(value:bigint)=>{const absolute=value<0n?-value:value;return `${value<0n?'−':''}${(absolute/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${String(absolute%100n).padStart(2,'0')}`;};
const shareText=(value:bigint,total:bigint)=>{if(value<=0n||total<=0n)return t('不计入','Not included');const tenths=(value*1000n+total/2n)/total;return tenths===0n?'<0.1%':`${tenths/10n}.${tenths%10n}%`;};
const nativeCurrency=(group:AllocationGroup)=>group.accounts?.[0]?.currency;
const groupKey=(group:AllocationGroup)=>`${group.id}:${nativeCurrency(group)||''}`;
const chartColors=['#357f6a','#5b91b5','#87b7a5','#8c91bd','#b9a179','#82a8bd','#b2c8b7','#b6b1cc','#809594','#c6c6bd'];
const assetColors:Record<string,string>={gold:'#b59a63',stock:'#357f6a',cash_management:'#79b198',fund:'#5b91b5',etf:'#8c91bd',cash:'#a1c3b7',bond:'#8ba5b5',security:'#b6b1cc',wealth:'#6b9d91',crypto:'#9b8db6',real_estate:'#6d8b9f',vehicle:'#9caaa8',valuable:'#b2a28a',insurance:'#779ba5',receivable:'#9eafb0',business:'#7a8caa',other:'#b6bbb8'};

/** Decimal arithmetic determines shares; floating point is used only for geometry. */
export function AllocationDonut({groups,currency,hidden,onSelect,label=t('资产分布','Asset allocation'),embedded=false}:Props){
  const noteId=useId(),legendId=useId(),[hovered,setHovered]=useState<string|null>(null),[focused,setFocused]=useState<string|null>(null),[expanded,setExpanded]=useState(false);
  const activeKey=hidden?null:hovered||focused;
  const ordered=hidden?[...groups].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||groupKey(a).localeCompare(groupKey(b))):[...groups].sort((a,b)=>a.amount>b.amount?-1:a.amount<b.amount?1:groupKey(a).localeCompare(groupKey(b)));
  const positive=ordered.filter(group=>group.amount>0n),excluded=ordered.filter(group=>group.amount<=0n);
  const total=groups.reduce((sum,group)=>sum+group.amount,0n),positiveTotal=positive.reduce((sum,group)=>sum+group.amount,0n);
  const active=ordered.find(group=>groupKey(group)===activeKey);
  const visible=expanded?ordered:ordered.slice(0,6),repeated=new Set(groups.filter((group,index)=>groups.findIndex(row=>row.id===group.id)!==index).map(group=>group.id));
  const name=(group:AllocationGroup)=>`${group.name}${nativeCurrency(group)&&(nativeCurrency(group)!==currency||repeated.has(group.id))?` ${nativeCurrency(group)}`:''}`;
  const colorKeys=groups.map(groupKey).sort();
  const color=(group:AllocationGroup)=>group.assetType&&assetColors[group.assetType]||chartColors[Math.max(0,colorKeys.indexOf(groupKey(group)))%chartColors.length];
  const select=(group:AllocationGroup)=>onSelect(group.id,nativeCurrency(group));
  let cumulative=0n;
  const segments=hidden?[]:positive.map(group=>{const start=Number(cumulative*1_000_000_000n/positiveTotal)/1_000_000_000;cumulative+=group.amount;const end=Number(cumulative*1_000_000_000n/positiveTotal)/1_000_000_000;return {group,start,fraction:end-start};});
  if(!groups.length)return <p className="allocation-donut-empty">{t('暂无资产记录。','No asset records yet.')}</p>;
  return <section className={`allocation-donut${embedded?' allocation-donut-embedded':''}${hidden?' is-hidden':''}`} aria-label={label} aria-describedby={excluded.length&&!hidden?noteId:undefined}>
    {!embedded&&<div className="allocation-donut-caption"><span>{label}</span><strong>{hidden?'••••':money(total)} <small>{currency}</small></strong></div>}
    <div className="allocation-donut-layout">
      <div className="allocation-donut-plot">
        <svg className="allocation-donut-svg" viewBox="0 0 280 280" role={hidden?undefined:'group'} aria-label={hidden?undefined:t('资产占比，选择扇区查看明细','Asset allocation; choose a segment for details')} aria-hidden={hidden||undefined}>
          <circle className="allocation-donut-track" cx="140" cy="140" r="100" fill="none" strokeWidth="48"/>
          {segments.map(({group,start,fraction})=><circle key={groupKey(group)} className="allocation-donut-segment" cx="140" cy="140" r="100" fill="none" stroke={color(group)} strokeWidth={activeKey===groupKey(group)?52:48} pathLength="1" strokeDasharray={`${Math.max(0,fraction-(segments.length>1?Math.min(.0025,fraction*.1):0))} ${1-Math.max(0,fraction-(segments.length>1?Math.min(.0025,fraction*.1):0))}`} strokeDashoffset={-start} transform="rotate(-90 140 140)" opacity={activeKey&&activeKey!==groupKey(group)?.38:1} role="button" tabIndex={0} aria-label={t(`${name(group)}，${money(group.amount)} ${currency}，占比 ${shareText(group.amount,positiveTotal)}`, `${name(group)}, ${money(group.amount)} ${currency}, ${shareText(group.amount,positiveTotal)} share`)} onPointerEnter={()=>setHovered(groupKey(group))} onPointerLeave={()=>setHovered(null)} onFocus={()=>setFocused(groupKey(group))} onBlur={()=>setFocused(null)} onClick={()=>select(group)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(group);}}}/>)}
        </svg>
        <div className="allocation-donut-center"><span>{hidden?t('金额已隐藏','Amounts hidden'):active?name(active):t('合计','Total')}</span><strong>{hidden?'••••':active?shareText(active.amount,positiveTotal):money(total)}</strong>{!hidden&&!active&&<small>{currency}</small>}</div>
      </div>
      <div className="allocation-donut-legend" id={legendId} role="list" aria-label={t(`${label}金额与占比`, `${label}: amounts and shares`)}>
        {visible.map(group=>{const key=groupKey(group),included=group.amount>0n,share=hidden?'••••':shareText(group.amount,positiveTotal);return <button key={key} type="button" className={`allocation-donut-row${activeKey===key?' is-active':''}`} style={{'--allocation-color':hidden||!included?'var(--color-border)':color(group),'--allocation-share':!hidden&&included&&positiveTotal>0n?`${Number(group.amount*1_000_000n/positiveTotal)/10_000}%`:'0%'} as CSSProperties} onClick={()=>select(group)} onPointerEnter={()=>setHovered(hidden?null:key)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setFocused(hidden?null:key)} onBlur={()=>setFocused(null)} aria-label={t(`查看${name(group)}明细，${group.subtitle?`${group.subtitle}，`:''}${hidden?'金额已隐藏':`${money(group.amount)} ${currency}，占比 ${share}`}`, `View ${name(group)} details, ${group.subtitle?`${group.subtitle}, `:''}${hidden?'amounts hidden':`${money(group.amount)} ${currency}, ${share} share`}`)}>
          <span className="allocation-donut-identity">{group.assetType?<span className="allocation-donut-type-icon"><FinanceIcon kind={group.assetType}/></span>:<BrandIcon id={group.id} size={28}/>}<span><span className="allocation-donut-name">{name(group)}</span>{group.subtitle&&<small>{group.subtitle}</small>}</span></span>
          <strong className="allocation-donut-amount">{hidden?'••••':money(group.amount)}</strong>
          <span className="allocation-donut-bar" aria-hidden="true"><i/></span><span className="allocation-donut-share">{share}</span>
        </button>;})}
        {ordered.length>6&&<Button className="allocation-donut-more" aria-expanded={expanded} aria-controls={legendId} variant="ghost" color="secondary" pill={false} size="sm" onClick={()=>setExpanded(!expanded)}>{expanded?t('收起','Show less'):t(`查看其余 ${ordered.length-visible.length} 项`,`Show ${ordered.length-visible.length} more`)}</Button>}
      </div>
    </div>
    {!hidden&&excluded.length>0&&<p className="allocation-donut-note" id={noteId}>{excluded.some(group=>group.amount<0n)?t('含负值资产；占比按正值计算。','Includes negative assets; shares use positive amounts.'):t(`${excluded.length} 项余额为零。`,`${excluded.length} items have a zero balance.`)}</p>}
  </section>;
}
