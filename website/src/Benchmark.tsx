import {useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {Checkbox} from '@openai/apps-sdk-ui/components/Checkbox';
import {ArrowUpRight, ChevronRight, Code} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import {SiteChoice} from './SiteChoice';
import type {BenchmarkCase, BenchmarkComparison, BenchmarkDataset, BenchmarkResult, BenchmarkText} from './benchmark-data';
import './benchmark.css';

const repository = 'https://github.com/YunyueLi/SecondU';

function ComparisonTable({data, rows, activeCase, onSelect, compact=false}: {
 data: BenchmarkDataset; rows: BenchmarkComparison[]; activeCase?: string;
 onSelect: (id: string) => void; compact?: boolean;
}) {
 const {language,t} = useSiteLanguage();
 const copy = (value: BenchmarkText) => value[language];
 const modes = data.modes.filter(mode => !data.comparisonModes || data.comparisonModes.includes(mode.id));
 return <div className={`benchmark-comparison${data.version==='v2'?' benchmark-comparison-v2':''}${compact?' is-compact':''}`} role="region" tabIndex={0} aria-label={t('分项对照表','Comparison of separate measures')}>
  {data.version==='v1'&&<p className="benchmark-table-hint">{t('左右滑动查看三个条件','Swipe to compare all three conditions')}</p>}
  <table>
   <caption className="benchmark-sr-only">{t('实际结果，分项呈现；没有综合质量分。','Observed results, reported separately. No aggregate quality score.')}</caption>
   <thead><tr>
    <th scope="col">{data.version==='v1'?t('四个连续场景','Four connected situations'):t('分项检查','Separate checks')}</th>
    {modes.map(mode => <th scope="col" key={mode.id} className={mode.id==='structured'?'is-structured':''}><span>{copy(mode.title)}</span>{data.version==='v1'&&<small>{copy(mode.description)}</small>}</th>)}
   </tr></thead>
   <tbody>{rows.map(row => <tr key={row.id} className={activeCase===row.id?'is-selected':''}>
    <th scope="row">
     {data.cases.some(item=>item.id===row.id)?<button type="button" onClick={()=>onSelect(row.id)} aria-pressed={activeCase===row.id}><span>{copy(row.label)}</span><ChevronRight/></button>:<span>{copy(row.label)}</span>}
     <small>{copy(row.detail)}</small>
    </th>
    {row.cells.map(cell=><td key={cell.mode} className={cell.mode==='structured'?'is-structured':''}><span className="benchmark-cell-value">{cell.text}</span>{cell.note&&<small>{copy(cell.note)}</small>}</td>)}
   </tr>)}</tbody>
  </table>
 </div>;
}

function PairedCases({data,capability,onCapability,onSelect,activeCase}: {
 data: BenchmarkDataset; capability: string; onCapability: (id:string)=>void;
 onSelect: (id:string)=>void; activeCase?: string;
}) {
 const {language,t}=useSiteLanguage();
 if(!data.paired||!data.capabilities)return null;
 const paired=data.paired;
 return <div className="benchmark-paired">
  <div className="benchmark-paired-title"><h3>{t('场景结果','Results by case')}</h3><button type="button" aria-pressed={capability==='all'} onClick={()=>onCapability('all')}>{t('全部维度','All dimensions')}</button></div>
  <p>{t('每格代表一道合成题。两次的动作与选择均符合预设要求，才记为稳定通过；点选题目查看原文。','Each cell is one synthetic case. Both repetitions must meet the prespecified action and choice requirements. Select a case to read its replies.')}</p>
  <div className="benchmark-pair-grid">
   {data.capabilities.map(group=><div className="benchmark-pair-row" key={group.id}>
    <button className="benchmark-capability" type="button" aria-pressed={capability===group.id} onClick={()=>onCapability(capability===group.id?'all':group.id)}>{group.title[language]}<ChevronRight/></button>
    <div>{data.cases.filter(item=>item.capability===group.id).map(item=>{
     const pair=paired.rows.find(row=>row.caseId===item.id);
     const category=paired.categories.find(category=>category.id===pair?.category);
     return <button key={item.id} className="benchmark-pair-case" type="button" data-category={pair?.category} aria-pressed={activeCase===item.id} title={`${item.title[language]} · ${category?.label[language]??''}`} aria-label={`${item.title[language]} · ${category?.label[language]??''}`} onClick={()=>onSelect(item.id)}><span aria-hidden="true"/><code>{item.id.toUpperCase()}</code></button>;
    })}</div>
   </div>)}
  </div>
  <ul className="benchmark-pair-legend">{paired.categories.map(category=><li key={category.id} data-category={category.id}><i aria-hidden="true"/><span>{category.label[language]}</span><strong>{category.count}</strong></li>)}</ul>
  <p className="benchmark-matrix-note">{t('维度名称可切换右侧检查结果。两次重复不增加独立样本数。','Select a dimension to filter the checks. Repeats do not add independent samples.')}</p>
 </div>;
}

function ReplyInspector({data,currentCase,result,mode,repetition,onMode,onRepetition}: {
 data: BenchmarkDataset; currentCase: BenchmarkCase; result?: BenchmarkResult;
 mode: string; repetition: number; onMode: (mode:string)=>void; onRepetition: (value:number)=>void;
}) {
 const {language,t}=useSiteLanguage();
 const copy=(value:BenchmarkText)=>value[language];
 function changeTab(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const next=event.key==='ArrowRight'?(index+1)%data.modes.length:event.key==='ArrowLeft'?(index+data.modes.length-1)%data.modes.length:event.key==='Home'?0:event.key==='End'?data.modes.length-1:null;
  if(next===null)return;
  event.preventDefault();onMode(data.modes[next].id);document.getElementById(`benchmark-mode-${data.modes[next].id}`)?.focus();
 }
 return <div className="benchmark-explorer">
  <aside className="benchmark-scenario">
   <h4>{copy(currentCase.title)}</h4><p>{copy(currentCase.description)}</p>
   <div className="benchmark-expectation"><span>{t('预期结果','Expected result')}</span><p>{copy(currentCase.expectation)}</p></div>
   <details><summary>{t('查看完整任务原文','Read the exact task')}<ChevronRight/></summary><p lang="en" className="benchmark-exact-task">{currentCase.prompt}</p></details>
   <small>{t('所有人物、偏好与材料均为合成内容。','All people, preferences and materials are synthetic.')}</small>
  </aside>
  <div className="benchmark-answer">
   <div className="benchmark-condition-tabs" role="tablist" aria-label={t('选择上下文条件','Choose the context condition')}>
    {data.modes.map((item,index)=><button id={`benchmark-mode-${item.id}`} key={item.id} type="button" role="tab" aria-selected={mode===item.id} aria-controls="benchmark-answer-panel" tabIndex={mode===item.id?0:-1} onClick={()=>onMode(item.id)} onKeyDown={event=>changeTab(event,index)}>{copy(item.title)}</button>)}
   </div>
   <div id="benchmark-answer-panel" role="tabpanel" aria-labelledby={`benchmark-mode-${mode}`} tabIndex={0}>
    {data.repetitions>1&&<div className="benchmark-repeat"><SiteChoice compact label={t('重复轮次','Repetition')} value={String(repetition)} options={Array.from({length:data.repetitions},(_,index)=>({value:String(index+1),label:t(`第 ${index+1} 次`,`Repetition ${index+1}`)}))} onChange={value=>onRepetition(Number(value))}/></div>}
    {result?<>
     <div className="benchmark-answer-meta"><span>{t('模型原始回答','Original model reply')}</span><span>{result.status==='completed'?t('已返回','Returned'):result.status==='timeout'?t('超时','Timed out'):result.status}{result.latencyMs!==null?` · ${(result.latencyMs/1000).toFixed(2)} s`:''}</span></div>
     <div className="benchmark-answer-body">
      <div className="benchmark-answer-choice" data-long={(result.selection||result.action).length>4}><span>{result.selection||result.action||'—'}</span><small>{result.selection?t('选择','Choice'):t('行动','Action')}</small></div>
      <div><p lang="en" className="benchmark-answer-reason">{result.reason||result.output||t('该次调用没有返回回答。','This call returned no answer.')}</p>{result.clarification&&<p lang="en" className="benchmark-answer-clarification">{result.clarification}</p>}</div>
     </div>
     {result.failureExplanation&&<p className="benchmark-failure-explanation">{copy(result.failureExplanation)}</p>}
     <div className="benchmark-checks">{result.checks.map(check=><div key={check.label.en} data-state={check.state}><span>{copy(check.label)}</span><strong><i aria-hidden="true"/>{copy(check.value)}</strong></div>)}</div>
     <details className="benchmark-evidence">
      <summary><Code/>{t('检查引用、输入与完整输出','Inspect references, input and full output')}<ChevronRight/></summary>
      <div className="benchmark-evidence-body">
       <h5>{t('引用的上下文标识','Cited context identifiers')}</h5>
       {result.citations.length?<ul className="benchmark-cited-sources">{result.citations.map((id,index)=>{
        const source=result.citationEvidence?.find(source=>source.id===id);
        return <li key={`${id}-${index}`}><code>{id}</code>{source&&<><span className="benchmark-source-status">{source.status} · {source.supplied?t('已提供给模型','Supplied to the model'):t('未提供给模型','Not supplied to the model')}</span>{source.statement&&<p lang="en">{source.statement}</p>}</>}</li>;
       })}</ul>:<p>{t('未返回上下文标识。','No context identifiers were returned.')}</p>}
       <h5>{t('传入的个人上下文','Supplied personal context')}</h5><pre tabIndex={0}>{result.context}</pre>
       <h5>{t('统一任务指令','Shared task instruction')}</h5><pre tabIndex={0}>{result.system}</pre>
       <h5>{t('完整输出','Complete output')}</h5><pre tabIndex={0}>{result.output||'—'}</pre>
       {result.diagnostics&&result.diagnostics.length>0&&<details className="benchmark-diagnostics"><summary>{t('调用诊断','Call diagnostics')}<ChevronRight/></summary><pre tabIndex={0}>{result.diagnostics.map(item=>`${item.code}: ${item.message}`).join('\n\n')}</pre></details>}
       <dl><div><dt>{t('输入 token','Input tokens')}</dt><dd>{result.inputTokens??'—'}</dd></div><div><dt>{t('输出 token','Output tokens')}</dt><dd>{result.outputTokens??'—'}</dd></div><div><dt>Input SHA-256</dt><dd><code>{result.inputHash||'—'}</code></dd></div><div><dt>Output SHA-256</dt><dd><code>{result.outputHash||'—'}</code></dd></div></dl>
      </div>
     </details>
    </>:<p className="benchmark-empty">{t('该条件没有可展示的调用记录。','No recorded call is available for this condition.')}</p>}
   </div>
  </div>
 </div>;
}

function BenchmarkSummary({data,reportUrl}:{data:BenchmarkDataset;reportUrl:string}){
 const {language,t}=useSiteLanguage();
 const metric=data.comparisons.find(item=>item.id==='decision')?.cells.find(item=>item.mode==='structured');
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
    <div className="benchmark-summary-stats"><span><strong>{data.cases.length}</strong>{t('个场景','cases')}</span><span><strong>{data.capabilities?.length??4}</strong>{t('类能力','capabilities')}</span><span><strong>{data.planned}</strong>{t('次调用','calls')}</span></div>
   </div>
   <div className="benchmark-capability-results" aria-label={t('各类能力的实际决策通过率','Observed decision pass rate by capability')}>
    {data.capabilities?.map(group=>{
     const cell=group.comparisons.find(item=>item.id==='decision')?.cells.find(item=>item.mode==='structured');
     const value=cell?.denominator?100*(cell.numerator??0)/cell.denominator:0;
     return <div className="benchmark-capability-result" key={group.id}><div><span>{(labels[group.id]??group.title)[language]}</span><strong>{value===100?'100':value.toFixed(1)}<small>%</small></strong></div><div className="benchmark-result-track" role="meter" aria-label={(labels[group.id]??group.title)[language]} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${cell?.numerator??0} / ${cell?.denominator??0}`}><span style={{width:`${value}%`}}/></div></div>;
    })}
   </div>
  </div>
  <div className="benchmark-summary-footer"><p>{t('多数任务已能正确使用个人上下文；检索覆盖与运行稳定性仍需改进。','Personal context supports correct decisions in most tested tasks; retrieval coverage and runtime reliability still need work.')}</p><a href={reportUrl}>{t('查看完整报告','View the full report')}<ArrowUpRight/></a></div>
  <p className="benchmark-summary-scope">{t('单模型合成评测 · 两次重复 · 原始材料与对照结果公开','Single-model synthetic evaluation · Two repetitions · Inputs and baseline results are public')}</p>
 </>;
}

export default function Benchmark({standalone=false}:{standalone?:boolean}){
 const {language,t}=useSiteLanguage();
 const Heading=standalone?'h1':'h2';
 const copy=(value:BenchmarkText)=>value[language];
 const surface=useRef<HTMLElement>(null),explorer=useRef<HTMLDivElement>(null);
 const [data,setData]=useState<BenchmarkDataset|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 const [activeCase,setActiveCase]=useState('confirmed_correction'),[mode,setMode]=useState('structured'),[repetition,setRepetition]=useState(1);
 const [onlyFailures,setOnlyFailures]=useState(false),[capability,setCapability]=useState('all');
 const base=import.meta.env.BASE_URL==='./'&&standalone?'../':import.meta.env.BASE_URL;
 const reportUrl=`${base}benchmark/?lang=${language}`;
 useEffect(()=>{
  let cancelled=false,started=false;
  function start(){
   if(started)return;started=true;setError(false);
   void import('./benchmark-data').then(module=>module.loadBenchmark()).then(value=>{
    if(cancelled)return;setData(value);
    setActiveCase(value.cases.find(item=>item.id==='l01')?.id??value.cases.find(item=>item.id==='confirmed_correction')?.id??value.cases[0].id);
   }).catch(()=>{if(!cancelled)setError(true);});
  }
  if(standalone)start();
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){start();observer.disconnect();}},{rootMargin:'400px'});
  if(surface.current)observer.observe(surface.current);
  return()=>{cancelled=true;observer.disconnect();};
 },[standalone,attempt]);
 const currentCase=data?.cases.find(item=>item.id===activeCase)??data?.cases[0];
 const result=data?.results.find(result=>result.caseId===currentCase?.id&&result.mode===mode&&result.repetition===repetition);
 const resultFailed=(result:BenchmarkResult)=>result.status!=='completed'||result.checks.some(check=>check.state==='fail');
 const hasFailure=(id:string)=>Boolean(data?.results.some(result=>result.caseId===id&&resultFailed(result)));
 const caseOptions=data?.cases.filter(item=>!onlyFailures||hasFailure(item.id))??[];
 const group=data?.capabilities?.find(group=>group.id===capability);
 const comparisons=group?.comparisons??data?.comparisons??[];
 function selectCase(id:string,scroll=false){
  setActiveCase(id);
  const failures=data?.results.filter(result=>result.caseId===id&&resultFailed(result))??[];
  const failure=failures.find(result=>result.mode===mode)??(onlyFailures?failures[0]:undefined);
  setRepetition(failure?.repetition??1);if(failure)setMode(failure.mode);
  if(onlyFailures&&!hasFailure(id))setOnlyFailures(false);
  if(scroll)explorer.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 }
 const evidenceBase=data?`${base}benchmark/${data.directory}`:'';
 return <section ref={surface} className={`site-section benchmark${standalone?' benchmark-standalone':''}`} id="benchmark" aria-labelledby="benchmark-title">
  <div className="benchmark-heading">
   <div className="site-section-head"><Heading id="benchmark-title">{standalone?t('个人上下文评测报告','Personal-context benchmark report'):t('个人上下文评测','Personal-context benchmark')}</Heading><p>{standalone?t('查看场景结果、对照条件与模型原文。所有评测材料均为合成内容，输入与输出完整公开。','Inspect results, context conditions and original replies. All evaluation material is synthetic; inputs and outputs are public.'):t('通过模拟任务，检验个人偏好、记忆更新与任务决策。','Testing personal preferences, memory updates and decisions through simulated tasks.')}</p></div>
   {standalone&&<a className="benchmark-method-link" href={`${repository}/blob/main/docs/CONTEXT-BENCHMARK.md`} target="_blank" rel="noreferrer">{t('阅读评测方法','Read the methodology')}<ArrowUpRight/></a>}
  </div>
  {!data?<div className="benchmark-loading" role="status">{error?<><p>{t('评测材料未能加载，请重新载入或查看原始记录。','The evidence could not be loaded. Try again or inspect the original record.')}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>{t('重新加载','Retry')}</button><a href={`${repository}/tree/main/benchmarks/results`}>{t('原始记录','Original records')}</a></>:t('正在载入评测结果…','Loading benchmark results…')}</div>:!standalone?<BenchmarkSummary data={data} reportUrl={reportUrl}/>:<>
   <div className="benchmark-runline"><div><strong>{data.version==='v1'?t('历史基线','Historical baseline'):t('上下文评测','Context benchmark')} · {data.version}</strong><span>{data.cases.length} {t('个合成场景','synthetic cases')}</span><span>{data.modes.length} {t('种条件','conditions')}</span><span>{data.repetitions} {t('次重复',data.repetitions===1?'repetition':'repetitions')}</span></div><span>{data.completed}/{data.planned} {t('次调用返回','calls returned')}<i aria-hidden="true"/></span></div>
   {data.paired?<div className="benchmark-primary-evidence">
    <PairedCases data={data} capability={capability} onCapability={setCapability} onSelect={id=>selectCase(id,true)} activeCase={currentCase?.id}/>
    <div className="benchmark-measures"><h3>{group?copy(group.title):t('全部维度的检查结果','Checks across all dimensions')}</h3><ComparisonTable data={data} rows={comparisons.slice(0,4)} onSelect={selectCase}/><details className="benchmark-more-measures"><summary>{t('查看引用与测试标记','Inspect citations and canaries')}<ChevronRight/></summary><ComparisonTable data={data} rows={comparisons.slice(4)} onSelect={selectCase} compact/></details></div>
   </div>:<ComparisonTable data={data} rows={comparisons} activeCase={currentCase?.id} onSelect={selectCase}/>}
   {data.calibration&&<p className="benchmark-calibration">{copy(data.calibration)}</p>}
   <div className="benchmark-findings">{data.findings.map(finding=><div key={finding.title.en}><h3>{copy(finding.title)}</h3><p>{copy(finding.text)}</p></div>)}</div>
   <div className="benchmark-explorer-head" ref={explorer}><h3>{t('详细结果','Detailed results')}</h3><div className="benchmark-explorer-tools">
    {data.version!=='v1'&&<Checkbox className="benchmark-failure-filter" label={t('只看失败','Failures only')} checked={onlyFailures} onCheckedChange={checked=>{setOnlyFailures(checked);if(checked){const first=data.results.find(result=>result.mode===mode&&resultFailed(result))??data.results.find(resultFailed);if(first){setActiveCase(first.caseId);setMode(first.mode);setRepetition(first.repetition);}}}}/>}
    {caseOptions.length>0&&<SiteChoice label={t('选择场景','Choose a case')} value={currentCase?.id??''} options={caseOptions.map(item=>({value:item.id,label:copy(item.title)}))} onChange={selectCase}/>}</div></div>
   {caseOptions.length===0?<p className="benchmark-empty">{t('本轮没有符合筛选条件的记录。','No records match this filter.')}</p>:currentCase&&<ReplyInspector key={currentCase.id} data={data} currentCase={currentCase} result={result} mode={mode} repetition={repetition} onMode={setMode} onRepetition={setRepetition}/>}
   <div className="benchmark-boundaries"><h3>{t('评测范围','Scope and limitations')}</h3><div><p>{data.model} · {data.effort} · {t('提供方快照标识','Provider snapshot')}: {data.snapshot??t('未返回','not reported')}</p><ul>{data.limitations.map(item=><li key={item.en}>{copy(item)}</li>)}</ul></div></div>
   <div className="benchmark-links">
    {!standalone&&<a className="benchmark-primary-link" href={reportUrl}>{t('独立打开评测','Open the full benchmark')}<ArrowUpRight/></a>}
    <a href={`${evidenceBase}/inputs.json`} target="_blank" rel="noreferrer">{t('输入材料','Exact inputs')}</a><a href={`${evidenceBase}/model-results.json`} target="_blank" rel="noreferrer">{t('全部模型回复','All model replies')}</a><a href={`${evidenceBase}/review.json`} target="_blank" rel="noreferrer">{t('逐项检查与哈希','Checks and hashes')}</a>{data.version==='v2'&&<a href={`${evidenceBase}/plan.json`} target="_blank" rel="noreferrer">{t('冻结的调用计划','Frozen trial plan')}</a>}<a href={`${base}benchmark/2026-10-01/review.html`} target="_blank" rel="noreferrer">{t('12 次历史基线','12-call historical baseline')}</a>
   </div>
  </>}
 </section>;
}
