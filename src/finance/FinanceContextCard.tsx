import { journalSourceLabel } from './journal-source.mjs';
import {useEffect,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {SegmentedControl} from '@openai/apps-sdk-ui/components/SegmentedControl';
import {Document,ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog} from '../components';
import {FinanceCategoryBars,FinanceTrend} from './FinanceCharts';
import {categoryLabel} from './journal-categories';
import {money} from './model';
import {useHiddenAmounts} from './api';
import {contextText as text,contextRows as rows,contextAmount as amount,parseFinanceContext,contextViews,initialContextView,contextAccountValues,contextScope,type ContextSnapshot as Snapshot} from './context-card-model.mjs';
import './finance-context-card.css';

const financeNames=/^(?:财务快照|账户快照|财务周报|交易记录 .+)\.json$/;
export function isFinanceContextAttachment(attachment:{name:string;mime:string;size:number}){return attachment.mime==='application/json'&&financeNames.test(attachment.name)&&attachment.size<=4*1024*1024;}
function Total({value,hidden}:{value:Snapshot|undefined;hidden:boolean}){
  if(amount(value?.amount)!==null&&value?.complete!==false)return <>{money(value?.amount,hidden)} <small>{text(value?.currency)}</small></>;
  const originals=Object.entries(value?.byCurrency||{}).filter(([,value])=>amount(value)!==null);
  return originals.length?<span className="finance-context-native">{originals.map(([code,value])=><span key={code}>{money(value,hidden)} <small>{code}</small></span>)}<small>待折算</small></span>:<span className="finance-context-muted">尚无记录</span>;
}
function WeeklyContext({report,hidden}:{report:Snapshot;hidden:boolean}){
  const current=report.current,previous=report.previous;
  return <div className="finance-context-object">
    <p className="finance-context-period">{text(current.from)} 至 {text(current.through)}</p>
    <dl className="finance-context-metrics">{[{id:'expenses',label:'本周支出'},{id:'income',label:'本周收入'},{id:'netCashFlow',label:'本周净流入'}].map(item=><div key={item.id}><dt>{item.label}</dt><dd><Total value={current[item.id]} hidden={hidden}/></dd><small>上期 <Total value={previous[item.id]} hidden={hidden}/></small>{amount(report.change?.[item.id]?.amount)!==null&&<small>变化 {money(report.change[item.id].amount,hidden)} {text(report.currency)}</small>}</div>)}</dl>
    <p className="finance-context-caption">上期为 {text(previous.from)} 至 {text(previous.through)}；仅包含已记录收支。</p>
    {rows(report.categories).length>0&&<details className="finance-context-detail"><summary>本周分类支出</summary><FinanceCategoryBars rows={rows(report.categories).map(row=>({id:text(row.category),name:categoryLabel(text(row.category)),amount:amount(row.current?.amount),count:row.current?.recordCount||0,byCurrency:row.current?.byCurrency,complete:row.current?.complete}))} currency={text(report.currency)} hidden={hidden}/></details>}
    {rows(report.upcoming?.items).length>0&&<details className="finance-context-detail"><summary>未来七天到期，共 {rows(report.upcoming.items).length} 项</summary><div className="finance-context-rows">{rows(report.upcoming.items).map((row,index)=><div key={`${text(row.recurringId)}:${text(row.occurrenceDate)}:${index}`}><span>{text(row.name)}<small>{text(row.occurrenceDate)}</small></span><strong>{money(amount(row.remainingAmount),hidden)} <small>{text(row.currency)}</small></strong></div>)}</div></details>}
    {report.netWorth?.latest&&<p className="finance-context-caption">净资产记录：{money(amount(report.netWorth.latest.valuation?.net),hidden)} {text(report.netWorth.latest.currency)}，记录日期 {text(report.netWorth.latest.date)}{report.netWorth.previous&&amount(report.netWorth.change)!==null?`，较 ${text(report.netWorth.previous.date)} 变化 ${money(report.netWorth.change,hidden)} ${text(report.netWorth.currency)}`:''}</p>}
    {report.credit?.latest&&<p className="finance-context-caption">信用记录：{hidden?'••••':report.credit.latest.score} 分，{text(report.credit.latest.provider)} {text(report.credit.latest.model)}，{text(report.credit.latest.asOf)}</p>}
  </div>;
}
function ScenarioContext({scenario,hidden}:{scenario:Snapshot;hidden:boolean}){
  const currency=text(scenario.currency),assumptions=scenario.assumptions,points=rows(scenario.points);
  return <div className="finance-context-object">
    <p className="finance-context-period">未来 {typeof assumptions.months==='number'?assumptions.months:points.at(-1)?.month} 个月的余额测算</p>
    <dl className="finance-context-metrics">{[{id:'baselineEnd',label:'维持现状'},{id:'plannedEnd',label:'应用计划'},{id:'difference',label:'计划影响'}].map(item=><div key={item.id}><dt>{item.label}</dt><dd>{money(amount(scenario[item.id]),hidden)} <small>{currency}</small></dd></div>)}</dl>
    <FinanceTrend label="情景测算余额" hidden={hidden} currency={currency} series={[{name:'应用计划',points:points.map(row=>({label:`第 ${row.month} 个月`,value:amount(row.planned)}))},{name:'维持现状',comparison:true,points:points.map(row=>({label:`第 ${row.month} 个月`,value:amount(row.baseline)}))}]}/>
    {typeof scenario.firstNegativeMonth==='number'&&<p className="finance-context-caption">计划下的余额首次在第 {scenario.firstNegativeMonth} 个月低于零。</p>}
    <details className="finance-context-detail"><summary>查看测算假设</summary><dl className="finance-context-assumptions">{[{id:'startingAmount',label:'起始余额'},{id:'monthlyIncome',label:'每月收入'},{id:'monthlyExpense',label:'每月支出'},{id:'plannedIncome',label:'计划每月收入'},{id:'plannedExpense',label:'计划每月支出'},{id:'oneTimeExpense',label:'一次性支出'}].map(item=><div key={item.id}><dt>{item.label}</dt><dd>{money(amount(assumptions[item.id]),hidden)} {currency}</dd></div>)}<div><dt>假设年化收益</dt><dd>{hidden?'••••':text(assumptions.annualReturn)}%</dd></div></dl></details>
    <p className="finance-context-caption">结果依据这份快照中的假设计算。</p>
  </div>;
}
function AccountRows({records,hidden}:{records:Snapshot[];hidden:boolean}){
  return <div className="finance-context-rows">{records.map((row,index)=>{const value=contextAccountValues(row);return <div key={text(row.id)||index}><span>{text(row.name)}<small>记录日期：{value.recorded.date||'未提供'}</small>{value.estimated&&<small>估值日期：{value.estimated.date||'未提供'}</small>}{(value.stale||value.reconciliationRequired)&&<small>{[value.stale?'保留上次值':'',value.reconciliationRequired?'余额待核对':''].filter(Boolean).join('，')}</small>}</span><strong>{value.estimated&&<span><small>估算余额 </small>{money(value.estimated.amount,hidden)} <small>{value.estimated.currency}</small></span>}<span><small>记录余额 </small>{money(value.recorded.amount,hidden)} <small>{value.recorded.currency}</small></span></strong></div>;})}</div>;
}

/** Historical cards only read the attached original, never today's balances. */
export function FinanceContextCard({url,file}:{url?:string;file?:File}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[original,setOriginal]=useState(''),[error,setError]=useState(''),[tab,setTab]=useState(''),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[hidden,setHidden]=useHiddenAmounts();
  useEffect(()=>{
    const controller=new AbortController();setSnapshot(null);setOriginal('');setError('');setExpanded(false);
    const read=async()=>{
      let content:string;
      if(file){if(file.size>4*1024*1024)throw new Error('快照过大，请下载原件核对。');content=await file.text();}
      else{if(!url||!/^\/api\/(?:spaces\/[a-zA-Z0-9_-]+\/)?attachments\/[a-zA-Z0-9_-]+$/.test(url))throw new Error('无法读取本地快照。');const response=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('快照读取失败，请下载原件核对。');content=await response.text();}
      if(content.length>4*1024*1024)throw new Error('快照过大，请下载原件核对。');
      const value=parseFinanceContext(content);if(!controller.signal.aborted){setSnapshot(value);setOriginal(content);setTab(initialContextView(value));}
    };
    void read().catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof SyntaxError?'快照格式无法读取，请下载原件核对。':failure instanceof Error?failure.message:'快照读取失败。');});return()=>controller.abort();
  },[url,file]);
  if(error)return <p className="finance-context-caption" role="alert">{error}</p>;
  if(!snapshot)return <p className="finance-context-caption" role="status">正在读取财务快照…</p>;
  const accounts=rows(snapshot.accounts),holdings=rows(snapshot.holdingValuations),transactions=rows(snapshot.journal?.transactions||snapshot.transactions),categories=rows(snapshot.analysis?.spending?.categories),history=rows(snapshot.journal?.netWorthHistory);
  const code=text(snapshot.analysis?.currency)||text(accounts[0]?.currency),currencyHistory=history.filter(row=>row.currency===code),options=contextViews(snapshot),chosen=options.some(option=>option.value===tab)?tab:options[0]?.value;
  const chosenRows=chosen==='accounts'?accounts:chosen==='holdings'?holdings:transactions,visibleRows=expanded?chosenRows:chosenRows.slice(0,6);
  const title=snapshot.weeklyReport?'财务周报':snapshot.scenario?'情景测算':snapshot.schema==='secondu.finance-transactions.v1'?'交易记录':'财务快照',scope=contextScope(snapshot),coverage=snapshot.journal?.transactionCoverage;
  const raw=<details className="finance-context-detail finance-context-raw"><summary>展开原始 JSON</summary>{hidden?<div className="finance-context-caption">金额已隐藏。<Button type="button" color="secondary" variant="ghost" size="sm" pill={false} onClick={()=>setHidden(false)}>显示金额以核对原始快照</Button></div>:<pre tabIndex={0}>{original}</pre>}</details>;
  return <section className="finance-context-card" aria-label={`${file?'发送前的':'对话中的'}${title}`}>
    <div className="finance-context-card-heading"><span><Document/><strong>{title}</strong></span><Button type="button" color="secondary" variant="ghost" pill={false} size="sm" onClick={()=>setOpen(true)}>查看来源<ArrowRight/></Button></div>
    {options.length>1&&<div className="finance-context-tabs"><SegmentedControl value={chosen} onChange={value=>{setTab(value);setExpanded(false);}} size="sm" pill={false} aria-label="财务快照内容">{options.map(option=><SegmentedControl.Option key={option.value} value={option.value}>{option.label}</SegmentedControl.Option>)}</SegmentedControl></div>}
    {chosen==='weekly'&&<WeeklyContext report={snapshot.weeklyReport} hidden={hidden}/>}
    {chosen==='scenario'&&<ScenarioContext scenario={snapshot.scenario} hidden={hidden}/>}
    {chosen==='spending'&&<FinanceCategoryBars rows={categories.map(row=>({id:text(row.category),name:categoryLabel(text(row.category)),amount:amount(row.total?.amount),count:typeof row.total?.recordCount==='number'?row.total.recordCount:0,byCurrency:row.total?.byCurrency,complete:row.total?.complete}))} currency={code} hidden={hidden}/>}
    {chosen==='accounts'&&<AccountRows records={visibleRows} hidden={hidden}/>}
    {chosen==='holdings'&&<div className="finance-context-rows">{visibleRows.map((row,index)=><div key={text(row.id)||index}><span>{text(row.name)||text(row.symbol)}<small>{text(row.sourceName)||'来源未注明'}</small><small>估值日期：{text(row.quoteAsOf)||text(row.asOf)||'未提供'}{row.status==='stale'||row.readStatus==='stale'?'，保留上次值':''}{row.positionCurrent===false?'，历史持仓':''}</small></span><strong>{money(amount(row.currentMarketValue??row.estimatedMarketValue??row.marketValue),hidden)} <small>{text(row.valuationCurrency)||text(row.recordedCurrency)}</small></strong></div>)}</div>}
    {chosen==='transactions'&&<div className="finance-context-rows">{visibleRows.map((row,index)=><div key={text(row.id)||index}><span>{text(row.merchant)||categoryLabel(text(row.category))}<small>{text(row.occurredOn)}，{row.kind==='transfer'?'转账':row.kind==='income'?'收入':'支出'}</small></span><strong>{money(amount(row.amount),hidden)} <small>{text(row.currency)}</small></strong></div>)}</div>}
    {['accounts','holdings','transactions'].includes(chosen)&&chosenRows.length>6&&<Button type="button" color="secondary" variant="ghost" pill={false} size="sm" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起':`显示全部 ${chosenRows.length} 条`}</Button>}
    {chosen==='accounts'&&currencyHistory.length>1&&<FinanceTrend label="快照中的净资产记录" hidden={hidden} currency={code} series={[{name:'净资产',points:currencyHistory.map(row=>({label:text(row.date),value:amount(row.valuation?.net)}))}]}/>}
    <p className="finance-context-caption">快照日期：{text(snapshot.observedAt)||text(snapshot.analysis?.today)||'未提供'}{!snapshot.weeklyReport&&!snapshot.scenario&&(text(snapshot.analysis?.month)||text(snapshot.month))?`，所选月份：${text(snapshot.analysis?.month)||text(snapshot.month)}`:''}</p>
    {!!scope.length&&<p className="finance-context-caption">附件范围：{scope.map(item=>`${item.count} 条${item.label}`).join('，')}。{coverage?.truncated?`交易共 ${coverage.available} 条，本快照包含 ${coverage.included} 条。`:''}</p>}
    {raw}
    {open&&<Dialog title="本次对话使用的财务记录" className="finance-settings finance-detail-dialog" onClose={()=>setOpen(false)}><div className="finance-context-sources">{snapshot.weeklyReport&&<section><h3>周报来源</h3><p>{text(snapshot.weeklyReport.current?.from)} 至 {text(snapshot.weeklyReport.current?.through)}</p><p>包含 {Array.isArray(snapshot.weeklyReport.sources?.recordIds)?snapshot.weeklyReport.sources.recordIds.length:0} 条来源记录。</p></section>}{snapshot.scenario&&<section><h3>情景测算来源</h3><p>测算假设、逐月余额及对比结果保存在此附件中。</p></section>}{accounts.length>0&&<section><h3>账户记录</h3><AccountRows records={accounts} hidden={hidden}/></section>}{transactions.length>0&&<section><h3>交易记录</h3>{transactions.map((row,index)=><div key={text(row.id)||index}><strong>{text(row.merchant)||categoryLabel(text(row.category))}</strong><p>{text(row.occurredOn)}，{money(amount(row.amount),hidden)} {text(row.currency)}</p><small>{journalSourceLabel(row.source)}，记录标识：{text(row.id)}</small></div>)}</section>}{holdings.length>0&&<section><h3>持仓估值</h3>{holdings.map((row,index)=><div key={text(row.id)||index}><strong>{text(row.name)||text(row.symbol)}</strong><p>{text(row.sourceName)} {text(row.quoteAsOf)||text(row.asOf)}</p><small>记录标识：{text(row.id)}</small></div>)}</section>}{raw}</div></Dialog>}
  </section>;
}
