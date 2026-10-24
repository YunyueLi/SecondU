import {t, useLocale, getLocale} from '../i18n';
import { journalSourceLabel } from './journal-source.mjs';
import {useEffect,useState} from 'react';
import {Button,ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Chat,Clock} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog} from '../components';
import type {FinanceWeeklyReport as WeeklyReport,FinanceRecordedTotal} from '../../shared/finance-journal';
import type {FinanceState} from './types';
import type {FinanceQuestion} from './FinanceWorkspace';
import {financeRequest} from './api';
import {money,today} from './model';
import {categoryLabel} from './journal-categories';
import {FinanceCategoryBars} from './FinanceCharts';
import {createFinanceContextSnapshot} from './context-snapshot.mjs';
import './finance-weekly-report.css';

export function FinanceWeeklyReport({state,hidden,onAsk}:{state:FinanceState;hidden:boolean;onAsk?:(question:FinanceQuestion)=>void}){
  useLocale();
  const [through,setThrough]=useState(today),[report,setReport]=useState<WeeklyReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sourcesOpen,setSourcesOpen]=useState(false);
  const currency=state.metadata?.onboarding?.displayCurrency||'CNY';
  useEffect(()=>{const controller=new AbortController();setBusy(true);setError('');setReport(null);financeRequest<{report:WeeklyReport}>('/journal/weekly',{through,currency},'POST',controller.signal).then(result=>setReport(result.report)).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:t("周报读取失败。", "Could not load the weekly report."));}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[state.revision,through,currency]);
  const showTotal=(value:FinanceRecordedTotal)=>value.amount!==null?<>{money(value.amount,hidden)} <small>{value.currency}</small></>:Object.keys(value.byCurrency).length?<span className="finance-weekly-native">{Object.entries(value.byCurrency).map(([code,amount])=><span key={code}>{money(amount,hidden)} <small>{code}</small></span>)}</span>:<span className="finance-data-meta">{t("尚无记录", "No records yet")}</span>;
  const ask=()=>{if(!report)return;const snapshot=JSON.parse(createFinanceContextSnapshot(state,{section:'planning'}).content);snapshot.weeklyReport=report;onAsk?.({prompt:t(`请结合${report.current.from}至${report.current.through}的已记录收支、计划与账户变化，帮我回顾这一周。`, `Review my week from ${report.current.from} to ${report.current.through}, using the recorded income, expenses, plans, and account changes.`),section:'planning',snapshot:{name:t("财务周报.json", "Financial weekly report.json"),content:JSON.stringify(snapshot,null,2)}});};
  const records=state.journal?.transactions.filter(row=>report?.sources.transactionIds.includes(row.id))||[];
  return <section className="finance-weekly-report" aria-busy={busy}>
    <div className="finance-weekly-controls"><div><label htmlFor="weekly-through">{t("截至日期", "Through date")}</label><Input id="weekly-through" type="date" max={today()} value={through} size="sm" onChange={event=>{if(event.target.value)setThrough(event.target.value);}}/></div><ButtonLink href="#automations/finance-weekly" color="secondary" variant="ghost" pill={false} size="sm"><Clock/>{t("每周自动整理", "Automate weekly reports")}</ButtonLink></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{busy&&<p className="finance-data-meta" role="status">{t("正在整理本周记录…", "Preparing this week’s report…")}</p>}
    {report&&<>
      <div className="finance-weekly-title"><div><h2>{report.current.from}{t(" 至 ", " to ")}{report.current.through}</h2><p className="finance-data-meta">{t("本期 ", "This period: ")}{report.current.transactionCount}{t(" 笔记录，上期 ", " records; previous period: ")}{report.previous.transactionCount}{t(" 笔记录", " records")}</p></div>{onAsk&&<Button color="secondary" variant="outline" pill={false} size="sm" onClick={ask}><Chat/>{t("聊聊这一周", "Discuss this week")}</Button>}</div>
      <dl className="finance-weekly-metrics">{([{id:'expenses',name:t("支出", "Expenses")},{id:'income',name:t("收入", "Income")},{id:'netCashFlow',name:t("净流入", "Net cash flow")}] as const).map(({id,name})=><div key={id}><dt>{name}</dt><dd>{showTotal(report.current[id])}</dd><small>{t("上期 ", "Previous period: ")}{report.previous.from}{t(" 至 ", " to ")}{report.previous.through}</small><span>{showTotal(report.previous[id])}</span>{report.change[id].amount!==null&&<small>{t("变化 ", "Change: ")}{money(report.change[id].amount,hidden)} {currency}</small>}</div>)}</dl>
      <div className="finance-weekly-grid">
        {report.categories.length>0&&<article className="finance-plan-item"><h3>{t("本周分类支出", "Expenses by category this week")}</h3><FinanceCategoryBars rows={report.categories.map(row=>({id:row.category,name:categoryLabel(row.category),amount:row.current.amount,count:row.current.recordCount,byCurrency:row.current.byCurrency,complete:row.current.complete}))} currency={currency} hidden={hidden}/></article>}
        {report.upcoming.items.length>0&&<article className="finance-plan-item"><h3>{t("未来七天到期", "Due in the next seven days")}</h3><div className="finance-widget-rows">{report.upcoming.items.map(row=><div key={`${row.recurringId}:${row.occurrenceDate}`}><span>{row.name}<small>{row.occurrenceDate}</small></span><strong>{money(row.remainingAmount,hidden)} <small>{row.currency}</small></strong></div>)}</div></article>}
        {report.netWorth.latest&&<article className="finance-plan-item"><h3>{t("最近净资产变化", "Latest net worth change")}</h3><div className="finance-widget-value">{money(report.netWorth.latest.valuation.net,hidden)}<small>{currency}</small></div><p className="finance-data-meta">{t(`${report.netWorth.latest.date} 保存的余额`, `Balance saved on ${report.netWorth.latest.date}`)}</p>{report.netWorth.previous&&<p>{t(`较 ${report.netWorth.previous.date} 变化 ${money(report.netWorth.change,hidden)} ${currency}`, `Change since ${report.netWorth.previous.date}: ${money(report.netWorth.change,hidden)} ${currency}`)}</p>}</article>}
        {report.credit.latest&&<article className="finance-plan-item"><h3>{t("最近信用记录", "Latest credit record")}</h3><div className="finance-widget-value">{hidden?'••••':report.credit.latest.score}<small>{report.credit.latest.provider} {report.credit.latest.model}</small></div><p className="finance-data-meta">{report.credit.latest.asOf}</p>{report.credit.previous&&<p>{t(`较 ${report.credit.previous.asOf} 变化 ${hidden?'••••':report.credit.change} 分`, `Change since ${report.credit.previous.asOf}: ${hidden?'••••':report.credit.change} points`)}</p>}</article>}
      </div>
      <div className="finance-weekly-sources"><Button color="secondary" variant="ghost" pill={false} size="sm" onClick={()=>setSourcesOpen(true)}>{t("查看 ", "View ")}{report.sources.recordIds.length}{t(" 条来源记录", " source records")}</Button></div>
    </>}
    {sourcesOpen&&report&&<Dialog title={t("周报来源", "Weekly report sources")} className="finance-settings finance-detail-dialog" onClose={()=>setSourcesOpen(false)}><div className="finance-widget-rows">{records.map(row=><div key={row.id}><span>{row.merchant||categoryLabel(row.category)}<small>{row.occurredOn}{t("，", ", ")}{journalSourceLabel(row.source, getLocale())}</small></span><strong>{money(row.amount,hidden)} <small>{row.currency}</small></strong></div>)}{state.journal?.recurring.filter(row=>report.sources.recurringIds.includes(row.id)).map(row=><div key={row.id}><span>{row.name}<small>{t("周期计划", "Recurring plan")}</small></span><strong>{money(row.amount,hidden)} <small>{row.currency}</small></strong></div>)}{[report.netWorth.previous,report.netWorth.latest].filter(Boolean).map(row=><div key={row!.id}><span>{t("净资产快照", "Net worth snapshot")}<small>{row!.date}</small></span><strong>{money(row!.valuation.net,hidden)} <small>{row!.currency}</small></strong></div>)}{[report.credit.previous,report.credit.latest].filter(Boolean).map(row=><div key={row!.id}><span>{row!.provider} {row!.model}<small>{row!.asOf}</small></span><strong>{hidden?'••••':row!.score}{t(" 分", " points")}</strong></div>)}</div></Dialog>}
  </section>;
}
