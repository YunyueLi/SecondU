import {t, useLocale} from '../i18n';
import {useRef,useState,type FormEvent} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Archive,Plus} from '@openai/apps-sdk-ui/components/Icon';
import {Field} from '../components';
import type {FinanceWatchlistRecord} from '../../shared/finance-journal';
import type {FinanceState} from './types';
import {financeRequest} from './api';
import './watchlist.css';
import './finance-record-form.css';

export function Watchlist({state,onSaved}:{state:FinanceState;onSaved:(state:FinanceState)=>void}){
  useLocale();
  const [showArchived,setShowArchived]=useState(false),[adding,setAdding]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const rows=(state.journal?.watchlist||[]).filter(row=>row.archived===showArchived);
  const archive=async(row:FinanceWatchlistRecord)=>{setBusy(true);setError('');try{const result=await financeRequest<{state:FinanceState}>('/journal/records/watchlist/archive',{id:row.id,expectedRevision:row.revision,archived:!row.archived,idempotencyKey:crypto.randomUUID()},'PUT');onSaved(result.state);}catch(failure){setError(failure instanceof Error?failure.message:t("自选状态保存失败。", "Could not save the watchlist status."));}finally{setBusy(false);}};
  return <div className="finance-watchlist">
    <div className="finance-data-summary"><span>{rows.length}{t(" 项自选", " watchlist items")}</span><Button color="secondary" variant="ghost" pill={false} size="sm" onClick={()=>setShowArchived(!showArchived)}>{showArchived?t("查看当前", "View active"):t("查看已移除", "View removed")}</Button></div>
    {rows.map(row=><div className="finance-watchlist-row" key={row.id}><span><strong>{row.name||row.symbol}</strong><small>{row.exchange} {row.symbol}{t("，", ", ")}{row.currency}</small></span><Button color="secondary" variant="ghost" size="sm" pill={false} disabled={busy} onClick={()=>void archive(row)}>{showArchived?t("恢复", "Restore"):<><Archive/>{t("移除", "Remove")}</>}</Button></div>)}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {adding?<WatchlistForm onSaved={next=>{onSaved(next);setAdding(false);setShowArchived(false);}} onCancel={()=>setAdding(false)}/>:<div className="dialog-actions"><Button color="primary" pill={false} disabled={busy} onClick={()=>setAdding(true)}><Plus/>{t("添加自选", "Add to watchlist")}</Button></div>}
  </div>;
}

function WatchlistForm({onSaved,onCancel}:{onSaved:(state:FinanceState)=>void;onCancel:()=>void}){
  const [exchange,setExchange]=useState('US'),[kind,setKind]=useState('stock'),[symbol,setSymbol]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const key=useRef(crypto.randomUUID());const changed=()=>{key.current=crypto.randomUUID();setError('');};
  const submit=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setError('');try{const result=await financeRequest<{state:FinanceState}>('/journal/records/watchlist',{expectedRevision:0,idempotencyKey:key.current,symbol:symbol.trim().toUpperCase(),exchange,kind,currency:exchange==='US'?'USD':exchange==='HK'?'HKD':'CNY',name:name.trim()||symbol.trim().toUpperCase(),source:{kind:'manual'}});onSaved(result.state);}catch(failure){setError(failure instanceof Error?failure.message:t("自选保存失败。", "Could not save the watchlist item."));}finally{setBusy(false);}};
  return <form className="finance-watchlist-form update-form finance-record-form" onSubmit={submit}>
    <div className="finance-record-field-grid"><Field label={t("市场", "Market")}><Select id="watchlist-market" value={exchange} options={[{value:'US',label:t("美国证券", "US securities")},{value:'HK',label:t("香港证券", "Hong Kong securities")},{value:'CN',label:t("中国公募基金", "China mutual funds")}]} pill={false} disabled={busy} onChange={option=>{setExchange(option.value);setKind(option.value==='CN'?'fund':kind==='fund'?'stock':kind);changed();}}/></Field><Field label={t("品种", "Asset type")}><Select id="watchlist-kind" value={kind} options={exchange==='CN'?[{value:'fund',label:t("公募基金", "Mutual fund")}]:[{value:'stock',label:t("股票", "Stock")},{value:'etf',label:'ETF'}]} pill={false} disabled={busy} onChange={option=>{setKind(option.value);changed();}}/></Field></div>
    <Field label={t("证券代码", "Symbol")}><Input id="watchlist-symbol" value={symbol} maxLength={24} required disabled={busy} placeholder={exchange==='US'?t("例如 AAPL", "e.g. AAPL"):exchange==='HK'?t("例如 0700", "e.g. 0700"):t("六位基金代码", "Six-digit fund code")} onChange={event=>{setSymbol(event.target.value);changed();}}/></Field>
    <Field label={t("显示名称（可选）", "Display name (optional)")}><Input id="watchlist-name" value={name} maxLength={160} disabled={busy} placeholder={t("可选", "Optional")} onChange={event=>{setName(event.target.value);changed();}}/></Field>
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><Button type="button" color="secondary" variant="outline" pill={false} disabled={busy} onClick={onCancel}>{t("取消", "Cancel")}</Button><Button type="submit" color="primary" pill={false} loading={busy}>{t("保存自选", "Save watchlist item")}</Button></div>
  </form>;
}
