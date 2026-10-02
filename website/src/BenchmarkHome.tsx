import {ArrowUpRight} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import type {BenchmarkText} from './benchmark-data';
import homepageSummary from 'virtual:benchmark-summary';
import './benchmark.css';

export function BenchmarkSummary({data,reportUrl}:{data:typeof homepageSummary;reportUrl:string}){
 const {language,t}=useSiteLanguage();
 const metric=data.decision;
 const percentage=metric?.denominator?100*(metric.numerator??0)/metric.denominator:null;
 const labels:Record<string,BenchmarkText>={
  tradeoffs:{zh:'偏好取舍',en:'Personal preferences'},planning:{zh:'组合规划',en:'Constraint planning'},temporal:{zh:'记忆更新',en:'Memory updates'},uncertainty:{zh:'信息澄清',en:'Clarification'},routing:{zh:'人物与任务',en:'People and tasks'},hygiene:{zh:'噪声排除',en:'Distracting evidence'},
 };
 return <>
  <div className="benchmark-summary">
   <div className="benchmark-score">
    <span>{t('SecondU 决策通过率','SecondU decision pass rate')}</span>
    <div className="benchmark-score-number">{percentage===null?'—':percentage.toFixed(1)}{percentage!==null&&<span>%</span>}</div>
    <p>{metric?t(`${metric.numerator} / ${metric.denominator} 次调用符合预设决策要求。`,`${metric.numerator} / ${metric.denominator} calls met the prespecified decision requirements.`):t('历史基线，查看完整报告。','Historical baseline. See the full report.')}</p>
    <div className="benchmark-summary-stats"><span><strong>{data.caseCount}</strong>{t('个场景','cases')}</span><span><strong>{data.capabilities?.length??4}</strong>{t('类能力','capabilities')}</span><span><strong>{data.planned}</strong>{t('次调用','calls')}</span></div>
   </div>
   <div className="benchmark-capability-results" aria-label={t('各类能力的实际决策通过率','Observed decision pass rate by capability')}>
    {data.capabilities?.map(group=>{
     const cell=group.decision;
     const value=cell?.denominator?100*(cell.numerator??0)/cell.denominator:0;
     return <div className="benchmark-capability-result" key={group.id}><div><span>{(labels[group.id]??group.title)[language]}</span><strong>{value===100?'100':value.toFixed(1)}<small>%</small></strong></div><div className="benchmark-result-track" role="meter" aria-label={(labels[group.id]??group.title)[language]} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${cell?.numerator??0} / ${cell?.denominator??0}`}><span style={{width:`${value}%`}}/></div></div>;
    })}
   </div>
  </div>
  <div className="benchmark-summary-footer"><p>{t('多数任务已能正确使用个人上下文；检索覆盖与运行稳定性仍需改进。','Personal context supports correct decisions in most tested tasks; retrieval coverage and runtime reliability still need work.')}</p><a href={reportUrl}>{t('查看完整报告','View the full report')}<ArrowUpRight/></a></div>
  <p className="benchmark-summary-scope">{t('单模型合成评测 · 两次重复 · 原始材料与对照结果公开','Single-model synthetic evaluation · Two repetitions · Inputs and baseline results are public')}</p>
 </>;
}


/** The homepage needs the published summary, not the full reply inspector. */
export default function BenchmarkHome(){
 const {language,t}=useSiteLanguage();
 const reportUrl=`${import.meta.env.BASE_URL}benchmark/?lang=${language}`;
 return <section className="site-section benchmark" id="benchmark" aria-labelledby="benchmark-title">
  <div className="benchmark-heading"><div className="site-section-head"><h2 id="benchmark-title">{t('个人上下文评测','Personal-context benchmark')}</h2><p>{t('通过模拟任务，检验个人偏好、记忆更新与任务决策。','Testing personal preferences, memory updates and decisions through simulated tasks.')}</p></div></div>
  <BenchmarkSummary data={homepageSummary} reportUrl={reportUrl}/>
 </section>;
}
