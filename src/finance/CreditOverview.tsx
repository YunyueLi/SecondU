import {t, useLocale} from '../i18n';
import {useEffect,useId,useState,type CSSProperties} from 'react';
import {SegmentedControl} from '@openai/apps-sdk-ui/components/SegmentedControl';
import type {FinanceCreditRecord} from '../../shared/finance-journal';
import {FinanceTrend} from './FinanceCharts';
import './CreditOverview.css';

export type CreditOverviewProps={record:FinanceCreditRecord;hidden:boolean;history?:FinanceCreditRecord[];showHeader?:boolean};

/** A report's score and scale are observations; no rating bands are inferred. */
export function CreditOverview({record,hidden,history=[],showHeader=true}:CreditOverviewProps){
  useLocale();
 const [view,setView]=useState('overview'),id=useId();
 useEffect(()=>setView('overview'),[record.id]);
 const compatible=history.filter(row=>row.provider===record.provider&&row.model===record.model&&row.min===record.min&&row.max===record.max&&!row.archived&&row.asOf<=record.asOf);
 if(!compatible.some(row=>row.id===record.id))compatible.push(record);
 compatible.sort((a,b)=>a.asOf.localeCompare(b.asOf)||a.createdAt.localeCompare(b.createdAt));
 const hasScale=Number.isFinite(record.score)&&Number.isFinite(record.min)&&Number.isFinite(record.max)&&record.max>record.min&&record.score>=record.min&&record.score<=record.max;
 const position=hasScale?(record.score-record.min)/(record.max-record.min)*100:0;
 return <section className="credit-overview" aria-label={t("信用评分报告", "Credit score report")}>
  {showHeader&&<div className="credit-overview-heading"><h3>{t("信用评分", "Credit score")}</h3><strong>{hidden?'••••':record.score}</strong></div>}
  <div className="credit-overview-tabs"><SegmentedControl value={view} onChange={setView} size="sm" pill aria-label={t("信用报告视图", "Credit report view")}><SegmentedControl.Option value="overview">{t("概况", "Overview")}</SegmentedControl.Option><SegmentedControl.Option value="trend">{t("趋势", "Trend")}</SegmentedControl.Option></SegmentedControl></div>
  <div id={`${id}-panel`} className="credit-overview-panel" aria-live="polite">
   {view==='overview'?<>
    {hidden?<p className="credit-overview-hidden">{t("分数已隐藏", "Score hidden")}</p>:hasScale?<div className="credit-overview-scale">
     <div className="credit-overview-track" role="meter" aria-label={t("报告分值在量表中的位置", "Reported score within the scale")} aria-valuemin={record.min} aria-valuemax={record.max} aria-valuenow={record.score} aria-describedby={`${id}-scale-note`} style={{'--credit-position':`${position}%`} as CSSProperties}><span/></div>
     <div className="credit-overview-scale-labels"><span>{record.min}</span><span id={`${id}-scale-note`}>{t("报告量表", "Reported scale")}</span><span>{record.max}</span></div>
    </div>:<p className="credit-overview-empty">{t("量表范围未提供", "Scale range not provided")}</p>}
    {record.factors.length?<dl className="credit-overview-factors">{record.factors.map((factor,index)=><div key={`${factor.name}-${index}`}><dt>{factor.name}</dt><dd>{hidden?'••••':factor.value||t("未提供", "Not provided")}</dd></div>)}</dl>:<p className="credit-overview-empty">{t("这份报告尚未记录影响因素。", "No factors have been recorded for this report.")}</p>}
    {record.note&&!hidden&&<p className="credit-overview-note">{record.note}</p>}
   </>:<>
    <FinanceTrend label={t(`${record.provider}信用分数记录`, `${record.provider} credit score history`)} currency={t("分", "points")} hidden={hidden} formatValue={value=>String(Number(value))} domain={hasScale?{min:record.min,max:record.max}:undefined} series={[{name:record.model||t("报告分数", "Reported score"),points:compatible.map(row=>({label:row.asOf,value:String(row.score)}))}]}/>
    {compatible.length<2&&<p className="credit-overview-empty">{t("目前只有一份可比较的报告。", "Only one comparable report is available.")}</p>}
   </>}
  </div>
  <p className="credit-overview-source">{record.provider}{record.model&&t(`，${record.model}`, `, ${record.model}`)}<span>{t("报告日期 ", "Report date ")}<time dateTime={record.asOf}>{record.asOf}</time></span></p>
 </section>;
}
