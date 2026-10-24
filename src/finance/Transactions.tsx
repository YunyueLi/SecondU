import {t, useLocale, getLocale} from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ArrowRight, Chat, ChevronRight, Document, Plus, Search } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog } from '../components';
import type { FinanceJournalAnalysis, FinanceJournalDocument, FinanceRecordedTotal, FinanceTransaction } from '../../shared/finance-journal';
import { financeRequest } from './api';
import { money, today } from './model';
import { categoryLabel, categoryOptions } from './journal-categories';
import { journalSourceLabel, journalSourceSnapshot } from './journal-source.mjs';
import { accountLabel, journalAccountOptions, journalCurrencyOptions } from './JournalFields';
import { TransactionForm } from './TransactionForm';
import { RecurringPayments } from './RecurringPayments';
import { FinanceCsvImport } from './FinanceCsvImport';
import type { FinanceQuestion } from './FinanceWorkspace';
import type { FinanceState } from './types';
import './Transactions.css';
import './finance-data-view.css';

export type TransactionTab = 'transactions' | 'bills' | 'subscriptions';
export type TransactionsProps = {
  state: FinanceState; hidden: boolean; onSaved: (state: FinanceState) => void | Promise<void>;
  onAsk?: (question: FinanceQuestion) => void; initialCategory?: string; initialMonth?: string; initialTab?: TransactionTab;
};
const transactionKind = (record: FinanceTransaction) => record.kind === 'transfer' ? t("账户间转账", "Account transfer") : record.kind === 'income' ? t("收入", "Income") : Number(record.amount) < 0 ? t("退款", "Refund") : t("支出", "Expenses");
const transactionName = (record: FinanceTransaction) => record.merchant || transactionKind(record);
const amountDirection = (record: FinanceTransaction) => record.kind === 'income' || (record.kind === 'expense' && Number(record.amount) < 0) ? 'journal-credit' : '';
function TransactionAmount({ record, hidden }: { record: FinanceTransaction; hidden: boolean }) {
  const sign = hidden || record.kind === 'transfer' || Number(record.amount) === 0 ? '' : record.kind === 'income' || Number(record.amount) < 0 ? '+' : '−';
  return <span className={`journal-transaction-amount ${hidden ? '' : amountDirection(record)}`}><strong className="finance-data-amount">{sign}{money(record.amount.replace(/^-/, ''), hidden)}</strong><small className="finance-data-meta">{record.currency}</small></span>;
}
function RecordedTotal({ value, hidden }: { value: FinanceRecordedTotal; hidden: boolean }) {
  const recordedAmount = value.recordCount === 0 ? '0.00' : value.amount;
  return <><span className="finance-data-amount">{money(recordedAmount, hidden)}</span> <span className="finance-data-meta">{value.currency}</span>{value.missingCurrencies.length > 0 && <small className="finance-data-meta journal-missing-rates">{t("部分原币待折算", "Some currencies await conversion")}</small>}</>;
}
function TransactionDetails({ state, record, hidden, onEdit, onSaved }: {
  state: FinanceState; record: FinanceTransaction; hidden: boolean; onEdit: () => void; onSaved: (state: FinanceState) => void | Promise<void>;
}) {
  const key = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const archive = async () => {
    if (saving || record.source.kind === 'connector') return; setSaving(true); setError('');
    try {
      const result = await financeRequest<{ state: FinanceState }>('/journal/records/transactions/archive', { id: record.id, expectedRevision: record.revision, idempotencyKey: key.current, archived: !record.archived }, 'PUT');
      if (!result.state?.journal) throw new Error(t("保存结果尚未完整返回，请重试确认。", "The save response is incomplete. Please try again to confirm."));
      await onSaved(result.state);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("交易状态保存失败，请重试。", "Could not save the transaction status. Please try again.")); }
    finally { setSaving(false); }
  };
  const plan = (state.journal as FinanceJournalDocument)?.recurring.find(item => item.id === record.recurringId);
  return <div className="transaction-details finance-data-view"><dl className="journal-detail-facts">
    <div><dt>{t("金额", "Amount")}</dt><dd><TransactionAmount record={record} hidden={hidden} /></dd></div><div><dt>{t("交易日期", "Transaction date")}</dt><dd>{record.occurredOn}</dd></div>
    <div><dt>{t("类型", "Type")}</dt><dd>{transactionKind(record)}</dd></div><div><dt>{t("类别", "Category")}</dt><dd>{categoryLabel(record.category)}{record.subcategory && <span className="finance-data-meta"> / {record.subcategory}</span>}</dd></div>
    <div><dt>{record.kind === 'transfer' ? t("转出账户", "From account") : t("账户", "Account")}</dt><dd>{accountLabel(state, record.accountId)}</dd></div>{record.kind === 'transfer' && <div><dt>{t("转入账户", "To account")}</dt><dd>{accountLabel(state, record.toAccountId)}</dd></div>}
    <div><dt>{t("记录来源", "Source")}</dt><dd>{journalSourceLabel(record.source, getLocale())}</dd></div>{record.source.kind === 'connector' && <div><dt>{t("来源更新于", "Source updated")}</dt><dd>{new Date(record.source.fetchedAt).toLocaleString(getLocale(), { hour12: false })}</dd></div>}{record.recurringId && <div><dt>{t("对应计划", "Linked plan")}</dt><dd>{plan?.name || t("已归档计划", "Archived plan")}<small className="finance-data-meta">{record.recurringOccurrenceOn}</small></dd></div>}
  </dl>{record.note && <p className="journal-detail-note">{record.note}</p>}{record.kind === 'transfer' && <p className="journal-form-hint">{t("转账独立记录，收支统计会排除这笔金额。", "Transfers are recorded separately and excluded from income and expense totals.")}</p>}{record.source.kind === 'connector' && <p className="journal-form-hint">{record.archived ? t("服务商已在完整查询范围内撤回此交易，当前收支统计已排除该记录。", "The provider withdrew this transaction within the full query range. It is excluded from current income and expense totals.") : t("此交易来自已连接账户。金额、日期和分类随服务商同步更新；如有误，请在来源账户更正后重新同步。", "This transaction comes from a connected account. Its amount, date, and category update when the provider syncs. To correct it, update the source account and sync again.")}</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="journal-detail-actions">{record.source.kind === 'connector' ? <ButtonLink href="#settings/connectors" color="secondary" variant="outline" pill={false}>{t("管理连接", "Manage connections")}</ButtonLink> : <><Button color="secondary" variant="ghost" pill={false} loading={saving} onClick={() => void archive()}>{record.archived ? t("恢复记录", "Restore record") : t("归档记录", "Archive record")}</Button>{!record.archived && <Button color="primary" pill={false} disabled={saving} onClick={onEdit}>{t("编辑交易", "Edit transaction")}</Button>}</>}</div></div>;
}

export function Transactions({ state, hidden, onSaved, onAsk, initialCategory, initialMonth, initialTab = 'transactions' }: TransactionsProps) {
  const locale = useLocale();
  const [tab, setTab] = useState<TransactionTab>(initialTab);
  const [month, setMonth] = useState(initialMonth || state.analysis?.month || today().slice(0,7));
  const [query, setQuery] = useState(''), [category, setCategory] = useState(initialCategory || 'all');
  const [kind, setKind] = useState('all'), [account, setAccount] = useState('all'), [currency, setCurrency] = useState('all'), [status, setStatus] = useState('active');
  const [filtersOpen, setFiltersOpen] = useState(false), [limit, setLimit] = useState(50);
  const [modal, setModal] = useState<{ type: 'create' } | { type: 'import' } | { type: 'view'; record: FinanceTransaction } | { type: 'edit'; record: FinanceTransaction } | null>(null);
  const [analysis, setAnalysis] = useState<FinanceJournalAnalysis | null>(state.analysis?.month === month ? state.analysis : null);
  const [analysisError, setAnalysisError] = useState(''), [analysisBusy, setAnalysisBusy] = useState(false);
  const journal = state.journal as FinanceJournalDocument | undefined;
  const baseCurrency = state.metadata?.onboarding?.displayCurrency || state.valuation?.currency || 'CNY';
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { if (initialMonth) setMonth(initialMonth); }, [initialMonth]);
  useEffect(() => { setCategory(initialCategory || 'all'); }, [initialCategory]);
  useEffect(() => { setLimit(50); }, [month, query, category, kind, account, currency, status]);
  useEffect(() => {
    if (!journal || !month) { setAnalysis(null); setAnalysisError(''); setAnalysisBusy(false); return; }
    if (state.analysis?.month === month && state.analysis.currency === baseCurrency) { setAnalysis(state.analysis); setAnalysisError(''); setAnalysisBusy(false); return; }
    const controller = new AbortController(); setAnalysis(null); setAnalysisError(''); setAnalysisBusy(true);
    void financeRequest<{ analysis: FinanceJournalAnalysis }>('/journal/analysis', { month, currency: baseCurrency }, 'POST', controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!result.analysis || result.analysis.month !== month) throw new Error(t("月份汇总尚未完整返回，请重新选择月份。", "The monthly summary is incomplete. Please select the month again."));
      setAnalysis(result.analysis);
    }).catch(failure => { if (!controller.signal.aborted) setAnalysisError(failure instanceof Error ? failure.message : t("月份汇总暂时无法读取。", "The monthly summary is currently unavailable.")); }).finally(() => { if (!controller.signal.aborted) setAnalysisBusy(false); });
    return () => controller.abort();
  }, [journal?.revision, month, baseCurrency, state.analysis]);
  const records = journal?.transactions || [];
  const categories = useMemo(() => [{ value: 'all', label: t("全部类别", "All categories") }, ...categoryOptions('expense', records.map(record => record.category)), ...categoryOptions('income').filter(option => !categoryOptions('expense', records.map(record => record.category)).some(item => item.value === option.value))], [records, locale]);
  const visible = useMemo(() => records.filter(record => record.archived === (status === 'archived')
    && (!month || record.occurredOn.startsWith(month))
    && (category === 'all' || (record.category || 'uncategorized') === category)
    && (kind === 'all' || (kind === 'refund' ? record.kind === 'expense' && Number(record.amount) < 0 : record.kind === kind))
    && (account === 'all' || record.accountId === account || record.toAccountId === account)
    && (currency === 'all' || record.currency === currency)
    && (!query.trim() || [transactionName(record), categoryLabel(record.category), record.subcategory, accountLabel(state, record.accountId), record.toAccountId ? accountLabel(state, record.toAccountId) : '', record.note, record.currency].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  ).sort((a,b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)), [records, status, month, category, kind, account, currency, query, state, locale]);
  const filterCount = [category !== 'all', kind !== 'all', account !== 'all', currency !== 'all', status !== 'active'].filter(Boolean).length;
  const hasFilters = filterCount > 0 || Boolean(query.trim());
  const hasCurrentRecords = records.some(record => !record.archived);
  const clearFilters = () => { setCategory('all'); setKind('all'); setAccount('all'); setCurrency('all'); setStatus('active'); setQuery(''); };
  const saved = async (next: FinanceState) => { await onSaved(next); setModal(null); };
  const ask = () => onAsk?.({ prompt: t(`帮我分析${month || '全部月份'}当前筛选的已记录交易。`, `Analyze the filtered recorded transactions for ${month || 'all months'}.`), section: 'transactions', snapshot: { name: t(`交易记录 ${month || '全部月份'}.json`, `Transactions ${month || 'all months'}.json`), content: JSON.stringify({ schema: 'secondu.finance-transactions.v1', month: month || null, scope: 'recorded_transactions_only', filter: { category, kind, account, currency, status, query }, matchedCount: visible.length, includedCount: Math.min(visible.length,100), transactions: visible.slice(0,100).map(({ id, occurredOn, kind, merchant, amount, currency, category, subcategory, accountId, toAccountId, recurringId, recurringOccurrenceOn, note, source }) => ({ id, occurredOn, kind, merchant, amount, currency, category, subcategory, account: accountLabel(state, accountId), toAccount: toAccountId ? accountLabel(state, toAccountId) : null, recurringId, recurringOccurrenceOn, note, source: journalSourceSnapshot(source) })) }, null, 2) } });
  return <div className="transactions-page finance-data-view">
    <div className="journal-navigation"><SegmentedControl value={tab} onChange={value => setTab(value as TransactionTab)} size="md" pill={false} aria-label={t("交易与计划页面", "Transactions and plans")}><SegmentedControl.Option value="transactions">{t("交易", "Transactions")}</SegmentedControl.Option><SegmentedControl.Option value="bills">{t("账单", "Bills")}</SegmentedControl.Option><SegmentedControl.Option value="subscriptions">{t("订阅", "Subscriptions")}</SegmentedControl.Option></SegmentedControl>{tab === 'transactions' && <div className="journal-navigation-actions"><Button pill={false} color="secondary" variant="outline" size="sm" onClick={() => setModal({ type: 'import' })} disabled={!journal}>{t("导入 CSV", "Import CSV")}</Button><Button pill={false} color="primary" size="sm" onClick={() => setModal({ type: 'create' })} disabled={!journal}><Plus />{t("添加交易", "Add transaction")}</Button></div>}</div>
    {tab === 'transactions' ? !journal ? <Alert color="danger" variant="soft" title={t("交易暂时无法读取", "Transactions are currently unavailable")} description={t("重新读取财务数据后再试。", "Reload your financial data and try again.")} /> : <>
      <div className="finance-page-toolbar finance-filter-toolbar journal-toolbar"><div className="finance-toolbar-filter journal-month-picker"><Input type="month" value={month} max={today().slice(0,7)} onChange={event => setMonth(event.target.value)} aria-label={t("交易月份", "Transaction month")} size="sm" /><Button pill={false} color="secondary" variant="ghost" size="sm" onClick={() => setMonth('')} aria-pressed={!month}>{t("全部", "All")}</Button></div><div className="finance-toolbar-search"><Input startAdornment={<Search />} value={query} onChange={event => setQuery(event.target.value)} aria-label={t("搜索交易", "Search transactions")} placeholder={t("商户、类别或备注", "Merchant, category, or note")} size="sm" /></div></div>
      <div className="finance-data-summary finance-data-actions"><div className="journal-summary-actions">{hasFilters && <Button pill={false} color="secondary" variant="ghost" size="sm" onClick={clearFilters}>{t("清除筛选", "Clear filters")}</Button>}<Button pill={false} color="secondary" variant="ghost" size="sm" onClick={() => setFiltersOpen(true)}>{t("筛选", "Filters")}{filterCount ? ` ${filterCount}` : ''}</Button>{onAsk && visible.length > 0 && <Button pill={false} color="secondary" variant="ghost" size="sm" onClick={ask} aria-label={t("分析当前交易", "Analyze these transactions")}><Chat /><span className="journal-ask-label">{t("分析", "Analyze")}</span></Button>}</div></div>
      {Boolean(month) && !filterCount && !query.trim() && <div className="journal-period-summary" aria-busy={analysisBusy}>{analysis ? <dl><div><dt>{t("当月已记录支出", "Recorded expenses this month")}</dt><dd><RecordedTotal value={analysis.spending.expenses} hidden={hidden} /></dd></div><div><dt>{t("当月已记录收入", "Recorded income this month")}</dt><dd><RecordedTotal value={analysis.spending.income} hidden={hidden} /></dd></div><div><dt>{t("当月净流入", "Net cash flow this month")}</dt><dd><RecordedTotal value={analysis.spending.netCashFlow} hidden={hidden} /></dd></div></dl> : analysisError ? <p className="form-error" role="alert">{analysisError}</p> : analysisBusy ? <p className="finance-data-meta" role="status">{t("正在读取月份汇总…", "Loading monthly summary…")}</p> : null}</div>}
      {visible.length ? <>
        <div className="journal-transactions-desktop"><table className="journal-transactions-table finance-data-table"><colgroup><col className="journal-col-date" /><col className="journal-col-merchant" /><col className="journal-col-category" /><col className="journal-col-account" /><col className="journal-col-amount" /></colgroup><thead><tr><th scope="col">{t("日期", "Date")}</th><th scope="col">{t("交易对象 / 类型", "Payee / type")}</th><th scope="col">{t("类别", "Category")}</th><th scope="col">{t("账户", "Account")}</th><th scope="col" className="journal-number">{t("原币金额", "Original amount")}</th></tr></thead><tbody>{visible.slice(0,limit).map(record => <tr key={record.id} className="journal-transaction-row" onClick={() => setModal({ type: 'view', record })}><td><time dateTime={record.occurredOn}>{record.occurredOn}</time></td><th scope="row"><Button className="journal-transaction-open" pill={false} color="secondary" variant="ghost" onClick={event => { event.stopPropagation(); setModal({ type: 'view', record }); }} aria-label={t(`查看${transactionName(record)}交易详情`, `View transaction details for ${transactionName(record)}`)}><span><strong className="finance-data-name">{transactionName(record)}</strong><small className="finance-data-meta">{transactionKind(record)}</small></span><ChevronRight aria-hidden="true" /></Button></th><td><span>{categoryLabel(record.category)}</span>{record.subcategory && <small className="finance-data-meta">{record.subcategory}</small>}</td><td><span>{accountLabel(state, record.accountId)}</span>{record.toAccountId && <small className="finance-data-meta">{t("转入 ", "To ")}{accountLabel(state, record.toAccountId)}</small>}</td><td className="journal-number"><TransactionAmount record={record} hidden={hidden} /></td></tr>)}</tbody></table></div>
        <ul className="journal-transactions-mobile">{visible.slice(0,limit).map(record => <li key={record.id}><button type="button" className="journal-mobile-transaction finance-data-row" onClick={() => setModal({ type: 'view', record })} aria-label={t(`查看${transactionName(record)}交易详情`, `View transaction details for ${transactionName(record)}`)}><span className="journal-mobile-identity"><strong className="finance-data-name">{transactionName(record)}</strong><span className="finance-data-meta">{record.occurredOn}　{transactionKind(record)}</span><span className="finance-data-meta">{categoryLabel(record.category)}{record.subcategory ? ` / ${record.subcategory}` : ''}</span><span className="finance-data-meta">{accountLabel(state, record.accountId)}</span></span><TransactionAmount record={record} hidden={hidden} /><ChevronRight aria-hidden="true" /></button></li>)}</ul>
        {visible.length > limit && <div className="journal-load-more"><Button pill={false} color="secondary" variant="ghost" onClick={() => setLimit(value => value + 50)}>{t(`再显示 ${Math.min(50,visible.length-limit)} 笔`, `Show ${Math.min(50,visible.length-limit)} more`)}<ArrowRight /></Button></div>}
      </> : <EmptyMessage fill="none" className="journal-empty"><EmptyMessage.Icon><Document /></EmptyMessage.Icon><EmptyMessage.Title>{hasFilters ? t("没有匹配的交易", "No matching transactions") : month && hasCurrentRecords ? t("这个月还没有交易记录", "No transactions this month") : t("还没有交易记录", "No transactions yet")}</EmptyMessage.Title><EmptyMessage.Description>{hasFilters ? t("调整月份或筛选条件，查看其他记录。", "Change the month or filters to see other records.") : month && hasCurrentRecords ? t("切换月份查看其他记录，或添加这个月的交易。", "Choose another month or add a transaction for this month.") : t("使用上方入口添加交易，或从本机 CSV 文件导入收支记录。", "Add a transaction above or import income and expenses from a local CSV file.")}</EmptyMessage.Description></EmptyMessage>}
    </> : <RecurringPayments key={tab} state={state} hidden={hidden} kind={tab === 'subscriptions' ? 'subscription' : 'bill'} onSaved={onSaved} />}
    {filtersOpen && <Dialog title={t("筛选交易", "Filter transactions")} className="finance-settings journal-dialog" onClose={() => setFiltersOpen(false)}><div className="journal-form"><div className="journal-field"><label htmlFor="journal-filter-kind">{t("类型", "Type")}</label><Select id="journal-filter-kind" pill={false} value={kind} options={[{ value: 'all', label: t("全部类型", "All types") }, { value: 'expense', label: t("支出（含退款）", "Expenses and refunds") }, { value: 'income', label: t("收入", "Income") }, { value: 'refund', label: t("退款", "Refund") }, { value: 'transfer', label: t("转账", "Transfer") }]} onChange={option => setKind(option.value)} /></div><div className="journal-field"><label htmlFor="journal-filter-category">{t("类别", "Category")}</label><Select id="journal-filter-category" pill={false} value={category} options={categories} onChange={option => setCategory(option.value)} /></div><div className="journal-field"><label htmlFor="journal-filter-account">{t("账户", "Account")}</label><Select id="journal-filter-account" pill={false} value={account} options={[{ value: 'all', label: t("全部账户", "All accounts") }, ...journalAccountOptions(state, undefined, true).filter(option => option.value)]} onChange={option => setAccount(option.value)} /></div><div className="journal-field"><label htmlFor="journal-filter-currency">{t("币种", "Currency")}</label><Select id="journal-filter-currency" pill={false} value={currency} options={[{ value: 'all', label: t("全部原币", "All currencies") }, ...journalCurrencyOptions]} onChange={option => setCurrency(option.value)} /></div><div className="journal-field"><label htmlFor="journal-filter-status">{t("记录状态", "Record status")}</label><Select id="journal-filter-status" pill={false} value={status} options={[{ value: 'active', label: t("当前记录", "Active records") }, { value: 'archived', label: t("已归档", "Archived") }]} onChange={option => setStatus(option.value)} /></div><div className="dialog-actions"><Button pill={false} color="secondary" variant="ghost" onClick={clearFilters}>{t("重置", "Reset")}</Button><Button pill={false} color="primary" onClick={() => setFiltersOpen(false)}>{t(`查看 ${visible.length} 笔交易`, `View ${visible.length} transactions`)}</Button></div></div></Dialog>}
    {modal && <Dialog title={modal.type === 'create' ? t("添加交易", "Add transaction") : modal.type === 'import' ? t("导入交易", "Import transactions") : modal.type === 'edit' ? t("编辑交易", "Edit transaction") : transactionName(modal.record)} className={`finance-settings journal-dialog${modal.type === 'import' ? ' journal-import-dialog' : ''}`} onClose={() => setModal(null)}>{modal.type === 'import' ? <FinanceCsvImport state={state} onSaved={onSaved} onCancel={() => setModal(null)} /> : modal.type === 'create' || modal.type === 'edit' ? <TransactionForm state={state} record={modal.type === 'edit' ? modal.record : undefined} onSaved={saved} onCancel={() => setModal(null)} /> : <TransactionDetails state={state} record={modal.record} hidden={hidden} onEdit={() => setModal({ type: 'edit', record: modal.record })} onSaved={saved} />}</Dialog>}
  </div>;
}
