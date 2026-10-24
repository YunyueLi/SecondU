import {t,useLocale} from '../i18n';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Checkbox} from '@openai/apps-sdk-ui/components/Checkbox';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {SegmentedControl} from '@openai/apps-sdk-ui/components/SegmentedControl';
import {ArrowDown,ArrowRight,ArrowUp,Chat,Edit,Plus} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog} from '../components';
import type {FinanceDashboard as DashboardSettings,FinanceJournalAnalysis,FinanceWidgetId} from '../../shared/finance-journal';
import type {FinanceSection,FinanceState} from './types';
import type {FinanceQuestion} from './FinanceWorkspace';
import type {PlanningTab} from './FinancePlanning';
import {financeRequest} from './api';
import {money,today} from './model';
import {dashboardBudgets,heldMarketRows} from './dashboard-data.mjs';
import {categoryLabel} from './journal-categories';
import {FinanceCategoryBars,FinanceTrend} from './FinanceCharts';
import {CreditOverview} from './CreditOverview';
import {BrandIcon} from './BrandIcon';
import {FinanceIcon} from './FinanceIcon';
import {AssetAllocation,investmentTypes} from './AssetAllocation';
import {assetAllocationFor} from './asset-allocation';
import {cadenceLabel} from './RecurringPayments';
import {createFinanceContextSnapshot} from './context-snapshot.mjs';
import {createFinanceTimeFormatter} from './time';
import './finance-dashboard.css';

export type FinanceDestination={section:FinanceSection;tab?:'transactions'|'bills'|'subscriptions'|PlanningTab;category?:string;month?:string};
const widgetTitles=():Record<FinanceWidgetId,string>=>({'net-worth':t("净资产变化","Net asset trend"),'spend-by-category':t("分类支出","Spending by category"),'spend-this-month':t("本月支出","This month’s spending"),'upcoming-payments':t("即将到期","Upcoming payments"),'subscriptions':t("订阅","Subscriptions"),'bills':t("账单","Bills"),'portfolio-distribution':t("投资组合","Investment portfolio"),'market-update':t("持仓行情","Holding quotes"),'credit-score':t("信用评分","Credit score"),'transactions':t("最近交易","Recent transactions"),'goals':t("储蓄目标","Savings goals"),'budgets':t("本月预算","This month’s budgets"),'memories':t("财务记忆","Financial memory")});
function quoteStatus(status:string|null,kind:string){if(kind==='fund'&&['live','delayed','closed'].includes(status||''))return t("最新公布净值","Latest published NAV");return ({example:t("示例价格","Example price"),live:t("实时报价","Live quote"),delayed:t("延迟报价","Delayed quote"),closed:t("已收市","Market closed"),stale:kind==='fund'?t("保留上次净值","Previous NAV"):t("保留上次报价","Previous quote")} as Record<string,string>)[status||'']||t("时效待确认","Quote timing unconfirmed");}
type Props={state:FinanceState;currency:string;hidden:boolean;onNavigate:(destination:FinanceDestination)=>void;onSaved:(state:FinanceState)=>void;onAsk?:(question:FinanceQuestion)=>void;onAccount?:(id:string)=>void;onHolding?:(accountId:string)=>void};

export function FinanceDashboard({state,currency,hidden,onNavigate,onSaved,onAsk,onAccount,onHolding}:Props){
  const locale=useLocale();
  const formatTime=useMemo(()=>createFinanceTimeFormatter(locale,state.market?.timeZone),[locale,state.market?.timeZone]);
  const titles=widgetTitles();
  const [month,setMonth]=useState(()=>today().slice(0,7)),[analysis,setAnalysis]=useState(state.analysis),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [recurringPeriods,setRecurringPeriods]=useState<Record<'subscriptions'|'bills','monthly'|'annual'>>({subscriptions:'monthly',bills:'monthly'});
  const [editing,setEditing]=useState(false),[captureBusy,setCaptureBusy]=useState(false),captureKey=useRef<string|null>(null);
  useEffect(()=>{
    if(state.analysis?.month===month&&state.analysis?.currency===currency){setAnalysis(state.analysis);setError('');setLoading(false);return;}
    const controller=new AbortController();setLoading(true);setError('');
    financeRequest<{analysis:FinanceJournalAnalysis}>('/journal/analysis',{month,currency},'POST',controller.signal).then(result=>setAnalysis(result.analysis)).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:t("统计读取失败。","Unable to load analysis."));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[state.revision,state.analysis,month,currency]);
  const journal=state.journal;
  if(!journal||!analysis)return null;
  const filteredAnalysis=analysis.month===month&&analysis.currency===currency?analysis:null;
  const activeTransactions=journal.transactions.filter(row=>!row.archived&&row.occurredOn.startsWith(month)).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||b.createdAt.localeCompare(a.createdAt));
  const activeRecurring=journal.recurring.filter(row=>!row.archived);
  const snapshots=analysis.netWorth.series.find(row=>row.currency===currency)?.history||[];
  const quotes=heldMarketRows(state).slice(0,5);
  const budgets=dashboardBudgets(filteredAnalysis,month);
  const available:Record<FinanceWidgetId,boolean>={
    'net-worth':snapshots.length>0,'spend-by-category':Boolean(filteredAnalysis?.spending.expenses.recordCount),'spend-this-month':Boolean(filteredAnalysis?.spending.expenses.recordCount),
    'upcoming-payments':analysis.upcoming.length>0,subscriptions:activeRecurring.some(row=>row.kind==='subscription'),bills:activeRecurring.some(row=>row.kind==='bill'),
    'portfolio-distribution':assetAllocationFor(state,currency).groups.some(group=>investmentTypes.has(group.type)),'market-update':quotes.length>0,'credit-score':Boolean(analysis.credit.latest),transactions:activeTransactions.length>0,
    goals:analysis.goals.length>0,budgets:budgets.length>0,memories:analysis.memories.length>0,
  };
  const go=(section:FinanceSection,tab?:FinanceDestination['tab'],category?:string)=>onNavigate({section,tab,category,month});
  const recordSnapshot=async()=>{
    if(captureBusy)return;setCaptureBusy(true);setError('');captureKey.current??=crypto.randomUUID();
    try{const result=await financeRequest<{state:FinanceState}>('/journal/snapshots',{idempotencyKey:captureKey.current});onSaved(result.state);captureKey.current=null;}
    catch(failure){setError(failure instanceof Error?failure.message:t("快照保存失败。","Unable to save the snapshot."));}finally{setCaptureBusy(false);}
  };
  const total=(amount:string|null|undefined,code=currency)=><span>{money(amount,hidden)} <small>{code}</small></span>;
  const recurringTotal=(id:'subscriptions'|'bills')=>{const rows=analysis[id].byCurrency;return rows.length?<span className="finance-widget-native-totals">{rows.map(row=><span key={row.currency}>{total(row[recurringPeriods[id]],row.currency)}</span>)}</span>:null;};
  const headline=(id:FinanceWidgetId):ReactNode=>{
    if(id==='net-worth')return total(snapshots.at(-1)?.valuation.net);
    if(id==='spend-by-category'||id==='spend-this-month')return total(filteredAnalysis?.spending.expenses.amount);
    if(id==='subscriptions'||id==='bills')return recurringTotal(id);
    if(id==='credit-score')return hidden?'••••':analysis.credit.latest?.score;
    return null;
  };
  const rowIcon=(kind:string)=><span className="finance-widget-row-icon"><FinanceIcon kind={kind}/></span>;

  const ask=(title:string)=>onAsk?.({prompt:t(`结合已记录的数据，帮我分析${title}。`,`Help me analyze ${title} using the recorded data.`),section:'overview',snapshot:createFinanceContextSnapshot({...state,analysis},{section:'overview',month})});
  const body=(id:FinanceWidgetId):ReactNode=>{
    switch(id){
      case 'portfolio-distribution':return null;
      case 'net-worth':return <><FinanceTrend label={t("净资产快照","Net asset snapshots")} hidden={hidden} currency={currency} series={[{name:t("净资产","Net assets"),points:snapshots.map(row=>({label:row.date,value:row.valuation.net}))}]}/><p className="finance-data-meta">{t(`${snapshots.at(-1)?.date} 保存的账户余额及汇率`,`Account balances and exchange rates recorded on ${snapshots.at(-1)?.date}`)}</p></>;
      case 'spend-by-category':return <><FinanceCategoryBars rows={(filteredAnalysis?.spending.categories||[]).map(row=>({id:row.category,name:categoryLabel(row.category),amount:row.total.amount,count:row.total.recordCount,byCurrency:row.total.byCurrency,complete:row.total.complete}))} currency={currency} hidden={hidden} onSelect={id=>go('transactions','transactions',id)}/>{!filteredAnalysis?.spending.expenses.complete&&<p className="finance-data-meta">{t("部分原币支出待折算","Some expenses need currency conversion")}</p>}</>;
      case 'spend-this-month':return <><FinanceTrend currency={currency} hidden={hidden} label={t("月度累计支出","Cumulative monthly spending")} series={[{name:t("累计支出","Cumulative spending"),points:(filteredAnalysis?.spending.daily||[]).map(row=>({label:row.date.slice(5),value:row.cumulative.amount}))},...((filteredAnalysis?.spending.comparisonMonths.length||0)>0?[{name:t("历史同期均值","Historical average"),comparison:true,points:filteredAnalysis!.spending.daily.map(row=>({label:row.date.slice(5),value:row.previousAverage}))}]:[])]}/><p className="finance-data-meta">{t(`${filteredAnalysis?.spending.expenses.recordCount} 笔已记录支出`,`${filteredAnalysis?.spending.expenses.recordCount} recorded expenses`)}{filteredAnalysis?.spending.comparisonMonths.length?t(`，对比 ${filteredAnalysis.spending.comparisonMonths.length} 个有记录月份`,`, compared with ${filteredAnalysis.spending.comparisonMonths.length} recorded months`):''}</p></>;
      case 'upcoming-payments':return <div className="finance-widget-rows">{analysis.upcoming.slice(0,6).map(row=>{const record=activeRecurring.find(item=>item.id===row.recurringId);return <button key={`${row.recurringId}:${row.occurrenceDate}`} onClick={()=>go('transactions',row.kind==='subscription'?'subscriptions':'bills')}>{rowIcon(record?.category||'services')}<span className="finance-widget-row-copy">{row.name}<small>{row.occurrenceDate}{Number(row.paidAmount)>0?t("，部分已记录",", partially recorded"):''}</small></span><strong>{total(row.remainingAmount,row.currency)}</strong></button>;})}</div>;
      case 'subscriptions':case 'bills':{const recurring=analysis[id],period=recurringPeriods[id];const records=activeRecurring.filter(row=>row.kind===(id==='subscriptions'?'subscription':'bill')).sort((a,b)=>(analysis.recurringSummary.find(item=>item.recurringId===a.id)?.nextOccurrenceDate||'9999').localeCompare(analysis.recurringSummary.find(item=>item.recurringId===b.id)?.nextOccurrenceDate||'9999'));return <>
        <div className="finance-widget-period"><SegmentedControl value={period} onChange={value=>setRecurringPeriods(previous=>({...previous,[id]:value as 'monthly'|'annual'}))} size="sm" pill aria-label={t(`${titles[id]}合计周期`,`${titles[id]} total period`)}><SegmentedControl.Option value="monthly">{t("每月","Monthly")}</SegmentedControl.Option><SegmentedControl.Option value="annual">{t("每年","Annual")}</SegmentedControl.Option></SegmentedControl></div>
        <div className="finance-widget-rows finance-widget-recurring">{records.slice(0,4).map(row=>{const next=analysis.recurringSummary.find(summary=>summary.recurringId===row.id)?.nextOccurrenceDate;return <button key={row.id} onClick={()=>go('transactions',id)}>{rowIcon(row.category||'services')}<span className="finance-widget-row-copy">{row.name}<small>{cadenceLabel(row)}{t('，',', ')}{next?t(`下次 ${next}`,`Next ${next}`):t("无后续日期","No upcoming date")}</small></span><strong>{total(row.amount,row.currency)}</strong></button>;})}</div>
        <p className="finance-data-meta">{period==='monthly'?t('合计按月度折算，列表为每期金额。','The total uses a monthly equivalent; each row shows its payment amount.'):t('合计按年度折算，列表为每期金额。','The total uses an annual equivalent; each row shows its payment amount.')}{recurring.excludedOnceCount>0&&t(`${recurring.excludedOnceCount} 项单次计划未计入合计。`, ` ${recurring.excludedOnceCount} one-time plans are excluded.`)}</p>
      </>;}
      case 'market-update':return <div className="finance-widget-rows finance-widget-market">{quotes.map(row=>{
        const formatted=formatTime(row.asOf);
        return <button key={row.id} onClick={()=>go('market')}><span className="finance-widget-row-brand"><BrandIcon id={row.symbol}/></span><span className="finance-widget-row-copy">{row.name||row.symbol}<small>{t(`${row.symbol}，报价 ${money(row.price,hidden)} ${row.currency}`,`${row.symbol}, quote ${money(row.price,hidden)} ${row.currency}`)}</small><small title={[row.sourceName,formatted?.title].filter(Boolean).join(t('，',', '))}>{quoteStatus(row.quoteStatus,row.kind)}{t('，',', ')}{formatted?<time dateTime={row.asOf||undefined}>{formatted.text}</time>:t("时间未提供或无效","Time unavailable")}</small></span><strong>{total(row.marketValue,row.currency)}<small className={!hidden&&row.changePct!=null?(Number(row.changePct)>0?'is-positive':Number(row.changePct)<0?'is-negative':''):undefined}>{hidden?'••••':row.changePct==null?t("涨跌幅未提供","Change unavailable"):`${Number(row.changePct)>0?'+':''}${row.changePct}%`}</small></strong></button>;
      })}</div>;
      case 'credit-score':return <CreditOverview record={analysis.credit.latest!} history={analysis.credit.history} hidden={hidden} showHeader={false}/>;
      case 'transactions':return <div className="finance-widget-rows">{activeTransactions.slice(0,6).map(row=><button key={row.id} onClick={()=>go('transactions','transactions')}>{rowIcon(row.category)}<span className="finance-widget-row-copy">{row.merchant||categoryLabel(row.category)}<small>{row.occurredOn}{t('，',', ')}{row.kind==='income'?t("收入","Income"):row.kind==='transfer'?t("转账","Transfer"):Number(row.amount)<0?t("退款","Refund"):t("支出","Expense")}</small></span><strong>{total(row.amount,row.currency)}</strong></button>)}</div>;
      case 'goals':return <div className="finance-widget-rows">{analysis.goals.slice(0,4).map(row=><button key={row.id} onClick={()=>go('planning','goals')}><span>{row.name}<small>{row.targetDate||t("未设截止日期","No target date")}</small></span><strong>{total(row.currentAmount,row.currency)}<small>{t(`目标 ${money(row.targetAmount,hidden)} ${row.currency}`,`Target ${money(row.targetAmount,hidden)} ${row.currency}`)}</small></strong></button>)}</div>;
      case 'budgets':return <div className="finance-widget-rows">{budgets.slice(0,4).map(row=><button key={row.id} onClick={()=>go('planning','budgets')}><span>{row.name}<small>{categoryLabel(row.category)}</small></span><strong>{total(row.spent.amount,row.currency)}<small>{t(`预算 ${money(row.amount,hidden)} ${row.currency}`,`Budget ${money(row.amount,hidden)} ${row.currency}`)}</small></strong></button>)}</div>;
      case 'memories':return <div className="finance-widget-memories">{analysis.memories.slice(0,3).map(row=><p key={row.id}>{hidden?t("内容已隐藏","Content hidden"):row.text}</p>)}</div>;
    }
  };
  const destination=(id:FinanceWidgetId)=>{
    if(id==='subscriptions'||id==='bills')go('transactions',id);
    else if(['goals','budgets','memories','credit-score'].includes(id))go('planning',id==='credit-score'?'creditRecords':id as PlanningTab);
    else if(id==='market-update')go('market');
    else go('transactions','transactions');
  };
  const visible=journal.dashboard.order.filter(id=>journal.dashboard.enabled.includes(id)&&available[id]);
  return <section className="finance-dashboard" aria-label={t("财务概览组件","Finance overview widgets")}>
    <div className="finance-dashboard-controls"><div className="finance-dashboard-period"><label htmlFor="finance-dashboard-month">{t("月份","Month")}</label><Input id="finance-dashboard-month" type="month" size="sm" value={month} max={today().slice(0,7)} onChange={event=>{if(event.target.value)setMonth(event.target.value);}}/></div><div><Button color="secondary" variant="ghost" size="sm" pill={false} onClick={()=>void recordSnapshot()} loading={captureBusy}>{t("记录今日净资产","Record today’s net assets")}</Button><Button color="secondary" variant="ghost" size="sm" pill={false} onClick={()=>setEditing(true)}><Edit/>{t("编辑总览","Edit overview")}</Button></div></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="finance-dashboard-grid" aria-busy={loading}>{visible.map(id=>id==='portfolio-distribution'?<div key={id} className="finance-dashboard-portfolio"><AssetAllocation state={state} currency={currency} hidden={hidden} scope="investments" onAccount={onAccount||(()=>go('accounts'))} onHolding={onHolding||(()=>go('holdings'))}/></div>:<article key={id} className={`finance-widget finance-widget-${id}`}><div className="finance-widget-heading"><h2>{titles[id]}</h2>{headline(id)!==null&&<div className="finance-widget-headline">{headline(id)}</div>}</div><div className="finance-widget-content">{body(id)}</div>{(onAsk||id!=='net-worth')&&<div className="finance-widget-actions">{onAsk&&<Button color="secondary" variant="ghost" pill={false} size="sm" aria-label={t(`聊聊${titles[id]}`,`Discuss ${titles[id]}`)} onClick={()=>ask(titles[id])}><Chat/>{t("讨论","Discuss")}</Button>}{id!=='net-worth'&&<Button color="secondary" variant="ghost" pill={false} size="sm" onClick={()=>destination(id)} aria-label={t(`查看${titles[id]}`,`View ${titles[id]}`)}>{t("查看明细","View details")}<ArrowRight/></Button>}</div>}</article>)}</div>
    {!activeTransactions.length&&<div className="finance-dashboard-start"><span>{t("记录日常收支，查看分类支出与每月趋势。","Record income and expenses to see categories and monthly trends.")}</span><Button color="secondary" variant="outline" pill={false} size="sm" onClick={()=>go('transactions','transactions')}><Plus/>{t("添加或导入交易","Add or import transactions")}</Button></div>}
    {editing&&<Dialog title={t("编辑财务总览","Edit finance overview")} className="finance-settings finance-dashboard-editor" onClose={()=>setEditing(false)}><DashboardEditor settings={journal.dashboard} available={available} onCancel={()=>setEditing(false)} onSaved={next=>{onSaved(next);setEditing(false);}}/></Dialog>}
  </section>;
}

function DashboardEditor({settings,available,onSaved,onCancel}:{settings:DashboardSettings;available:Record<FinanceWidgetId,boolean>;onSaved:(state:FinanceState)=>void;onCancel:()=>void}){
  const titles=widgetTitles();
  const [order,setOrder]=useState(settings.order),[enabled,setEnabled]=useState(settings.enabled),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const key=useRef(crypto.randomUUID());
  const change=()=>{key.current=crypto.randomUUID();setError('');};
  const move=(index:number,offset:number)=>{const next=[...order];[next[index],next[index+offset]]=[next[index+offset],next[index]];setOrder(next);change();};
  const save=async()=>{setBusy(true);setError('');try{const result=await financeRequest<{state:FinanceState}>('/journal/dashboard',{enabled,order,expectedRevision:settings.revision,idempotencyKey:key.current},'PUT');onSaved(result.state);}catch(failure){setError(failure instanceof Error?failure.message:t("总览设置保存失败。","Unable to save overview settings."));}finally{setBusy(false);}};
  return <><div className="finance-dashboard-options">{order.map((id,index)=><div key={id}><Checkbox label={titles[id]} checked={enabled.includes(id)} disabled={busy} onCheckedChange={checked=>{setEnabled(current=>checked?[...current,id]:current.filter(value=>value!==id));change();}}/>{!available[id]&&<small>{t("有记录后显示","Shown when records are available")}</small>}<div><Button color="secondary" variant="ghost" uniform pill={false} size="sm" disabled={busy||index===0} aria-label={t(`上移${titles[id]}`,`Move ${titles[id]} up`)} onClick={()=>move(index,-1)}><ArrowUp/></Button><Button color="secondary" variant="ghost" uniform pill={false} size="sm" disabled={busy||index===order.length-1} aria-label={t(`下移${titles[id]}`,`Move ${titles[id]} down`)} onClick={()=>move(index,1)}><ArrowDown/></Button></div></div>)}</div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><Button color="secondary" variant="outline" pill={false} disabled={busy} onClick={onCancel}>{t("取消","Cancel")}</Button><Button color="primary" pill={false} loading={busy} onClick={()=>void save()}>{t("保存","Save")}</Button></div></>;
}
