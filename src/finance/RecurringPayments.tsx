import {t, useLocale} from '../i18n';
import { useMemo, useRef, useState } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ChevronRight, Document, Plus, Search } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog } from '../components';
import type { FinanceJournalAnalysis, FinanceJournalDocument, FinanceRecurring } from '../../shared/finance-journal';
import { financeRequest } from './api';
import { money, today } from './model';
import { categoryLabel } from './journal-categories';
import { accountLabel } from './JournalFields';
import { RecurringPaymentForm } from './RecurringPaymentForm';
import { TransactionForm, type TransactionPreset } from './TransactionForm';
import type { FinanceState } from './types';
import './RecurringPayments.css';
import './finance-data-view.css';

type Props = { state: FinanceState; hidden: boolean; kind: 'bill' | 'subscription'; onSaved: (state: FinanceState) => void | Promise<void> };
const kindLabel = (kind: FinanceRecurring['kind']) => kind === 'subscription' ? t("订阅", "Subscriptions") : kind === 'income' ? t("定期收入", "Recurring income") : t("账单", "Bills");
export function cadenceLabel(record: Pick<FinanceRecurring, 'frequency' | 'interval'>) {
  if (record.frequency === 'once') return t("仅一次", "One time");
  const unit = { weekly: t("周", "week"), monthly: t("月", "month"), quarterly: t("季度", "quarter"), yearly: t("年", "year") }[record.frequency];
  return record.interval === 1 ? t(`每${unit}`, `Every ${unit}`) : t(`每 ${record.interval} ${unit}`, `Every ${record.interval} ${unit}s`);
}
function RecurringDetails({ state, record, hidden, onEdit, onPayment, onSaved }: {
  state: FinanceState; record: FinanceRecurring; hidden: boolean; onEdit: () => void; onPayment: (preset: TransactionPreset) => void;
  onSaved: (state: FinanceState) => void | Promise<void>;
}) {
  const key = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const analysis = state.analysis as FinanceJournalAnalysis;
  const next = analysis?.recurringSummary.find(item => item.recurringId === record.id)?.nextOccurrenceDate;
  const occurrence = analysis?.upcoming.find(item => item.recurringId === record.id && item.occurrenceDate === next);
  const journal = state.journal as FinanceJournalDocument;
  const linked = journal.transactions.filter(item => !item.archived && item.recurringId === record.id).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const archive = async () => {
    if (saving) return; setSaving(true); setError('');
    try {
      const result = await financeRequest<{ state: FinanceState }>(`/journal/records/recurring/archive`, { id: record.id, expectedRevision: record.revision, idempotencyKey: key.current, archived: !record.archived }, 'PUT');
      if (!result.state?.journal) throw new Error(t("保存结果尚未完整返回，请重试确认。", "The save response is incomplete. Please try again to confirm."));
      await onSaved(result.state);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("计划状态保存失败，请重试。", "Could not save the plan status. Please try again.")); }
    finally { setSaving(false); }
  };
  const recordPayment = () => { onPayment({
    kind: record.kind === 'income' ? 'income' : 'expense', occurredOn: today(),
    amount: occurrence?.remainingAmount ?? record.amount, currency: record.currency, merchant: record.name,
    category: record.category, subcategory: record.subcategory, accountId: record.accountId,
    recurringId: record.id, recurringOccurrenceOn: next || record.anchorDate,
  }); };
  return <div className="recurring-details finance-data-view">
    <dl className="journal-detail-facts">
      <div><dt>{t("每期金额", "Amount per occurrence")}</dt><dd className="finance-data-amount">{money(record.amount, hidden)} <small className="finance-data-meta">{record.currency}</small></dd></div>
      <div><dt>{t("周期", "Frequency")}</dt><dd>{cadenceLabel(record)}</dd></div>
      <div><dt>{t("下一日期", "Next date")}</dt><dd>{record.archived ? t("已归档", "Archived") : next || t("无后续计划", "No future occurrence")}</dd></div>
      <div><dt>{t("首次日期", "First date")}</dt><dd>{record.anchorDate}</dd></div>
      <div><dt>{record.kind === 'income' ? t("收款账户", "Receiving account") : t("付款账户", "Paying account")}</dt><dd>{accountLabel(state, record.accountId)}</dd></div>
      <div><dt>{t("类别", "Category")}</dt><dd>{categoryLabel(record.category)}{record.subcategory && <span className="finance-data-meta"> / {record.subcategory}</span>}</dd></div>
      {record.endDate && <div><dt>{t("结束日期", "End date")}</dt><dd>{record.endDate}</dd></div>}
      {occurrence && Number(occurrence.paidAmount) > 0 && <div><dt>{t("本期已记录", "Recorded this occurrence")}</dt><dd>{money(occurrence.paidAmount, hidden)} {record.currency}<span className="finance-data-meta">{t("，尚余 ", ", remaining ")}{money(occurrence.remainingAmount, hidden)} {record.currency}</span></dd></div>}
    </dl>
    {record.note && <p className="journal-detail-note">{record.note}</p>}
    <section className="recurring-linked"><h3>{t("关联交易 ", "Linked transactions ")}<span className="finance-data-meta">{linked.length}</span></h3>{linked.length ? <ul>{linked.slice(0,12).map(transaction => <li key={transaction.id}><span><time>{transaction.occurredOn}</time><small className="finance-data-meta">{t(`对应 ${transaction.recurringOccurrenceOn || '未注明'} 这一期`, `Occurrence: ${transaction.recurringOccurrenceOn || 'not specified'}`)}</small></span><span className="finance-data-amount">{money(transaction.amount, hidden)} <small className="finance-data-meta">{transaction.currency}</small></span></li>)}</ul> : <p className="finance-data-meta">{t("实际发生后，添加付款或收款记录来核对本期金额。", "After it occurs, record the payment or income to reconcile this occurrence.")}</p>}{linked.length > 12 && <p className="finance-data-meta">{t("最近 12 笔，完整记录可在交易中查看。", "Showing the latest 12. View all records in Transactions.")}</p>}</section>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="journal-detail-actions"><Button color="secondary" variant="ghost" pill={false} loading={saving} onClick={() => void archive()}>{record.archived ? t("恢复计划", "Restore plan") : t("归档计划", "Archive plan")}</Button>{!record.archived && <><Button color="secondary" variant="outline" pill={false} disabled={saving} onClick={onEdit}>{t("编辑", "Edit")}</Button>{Number(record.amount) > 0 && <Button color="primary" pill={false} disabled={saving} onClick={recordPayment}>{record.kind === 'income' ? t("记录收款", "Record income") : t("记录付款", "Record payment")}</Button>}</>}</div>
  </div>;
}

export function RecurringPayments({ state, hidden, kind, onSaved }: Props) {
  useLocale();
  const [query, setQuery] = useState(''), [status, setStatus] = useState('active');
  const [type, setType] = useState('all'), [period, setPeriod] = useState('monthly');
  const [modal, setModal] = useState<{ type: 'create' } | { type: 'view' | 'edit'; record: FinanceRecurring } | { type: 'payment'; preset: TransactionPreset } | null>(null);
  const journal = state.journal as FinanceJournalDocument | undefined;
  const analysis = state.analysis as FinanceJournalAnalysis | undefined;
  const summaries = new Map(analysis?.recurringSummary.map(item => [item.recurringId, item]) || []);
  const records = useMemo(() => (journal?.recurring || []).filter(record => kind === 'subscription' ? record.kind === 'subscription' : record.kind === 'bill' || record.kind === 'income'), [journal, kind]);
  const visible = records.filter(record => record.archived === (status === 'archived') && (type === 'all' || record.kind === type) && (!query.trim() || [record.name, categoryLabel(record.category), record.subcategory, accountLabel(state, record.accountId), record.currency].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).sort((a, b) => (summaries.get(a.id)?.nextOccurrenceDate || '9999').localeCompare(summaries.get(b.id)?.nextOccurrenceDate || '9999') || a.name.localeCompare(b.name));
  const totals = kind === 'subscription' ? analysis?.subscriptions : analysis?.bills;
  const label = kind === 'subscription' ? t("订阅", "Subscriptions") : t("账单", "Bills");
  const hasFilters = Boolean(query.trim()) || type !== 'all';
  const saved = async (next: FinanceState) => { await onSaved(next); setModal(null); };
  if (!journal) return <Alert color="danger" variant="soft" title={t(`${label}暂时无法读取`, `${label} are currently unavailable`)} description={t("重新读取财务数据后再试。", "Reload your financial data and try again.")} />;
  return <section className="recurring-payments finance-data-view" aria-label={t(`${label}记录`, `${label} records`)}>
    <div className="journal-section-actions"><Button pill={false} color="primary" size="sm" onClick={() => setModal({ type: 'create' })}><Plus />{t(`添加${label}`, `Add ${kind === 'subscription' ? 'subscription' : 'bill'}`)}</Button></div>
    <div className="finance-page-toolbar finance-filter-toolbar recurring-toolbar"><div className="finance-toolbar-filter"><Select pill={false} aria-label={t(`${label}记录状态`, `${label} status`)} value={status} options={[{ value: 'active', label: t(`当前${label}`, `Active ${label.toLowerCase()}`) }, { value: 'archived', label: t("已归档", "Archived") }]} onChange={option => setStatus(option.value)} /></div><div className="finance-toolbar-search"><Input value={query} onChange={event => setQuery(event.target.value)} startAdornment={<Search />} aria-label={t(`搜索${label}`, `Search ${label.toLowerCase()}`)} placeholder={t("名称、类别或账户", "Name, category, or account")} /></div></div>
    <div className="finance-data-summary finance-data-actions"><SegmentedControl value={period} onChange={setPeriod} size="sm" pill={false} aria-label={t(`${label}折算周期`, `${label} conversion period`)}><SegmentedControl.Option value="monthly">{t("每月", "Monthly")}</SegmentedControl.Option><SegmentedControl.Option value="annual">{t("每年", "Annual")}</SegmentedControl.Option></SegmentedControl></div>
    {status === 'active' && !query.trim() && type === 'all' && Boolean(totals?.activeCount) && <div className="recurring-equivalents"><span className="finance-data-meta">{t(`${label}${period === 'monthly' ? '月度' : '年度'}折算`, `${period === 'monthly' ? 'Monthly' : 'Annual'} equivalent`)}</span><dl>{totals!.byCurrency.map(total => <div key={total.currency}><dt className="finance-data-meta">{total.currency}</dt><dd className="finance-data-amount">{money(period === 'monthly' ? total.monthly : total.annual, hidden)}</dd></div>)}</dl><p className="finance-data-meta">{t("按已记录周期折算，实际支出见交易。", "Converted using the recorded frequency. See Transactions for actual expenses.")}{Boolean(totals?.excludedOnceCount) && t(`${totals!.excludedOnceCount} 项单次计划按每期金额列出。`, ` ${totals!.excludedOnceCount} one-time plans are shown at their occurrence amounts.`)}</p></div>}
    {kind === 'bill' && records.some(record => record.kind === 'income') && <div className="journal-list-filters"><Select aria-label={t("计划种类", "Plan type")} pill={false} value={type} options={[{ value: 'all', label: t("全部计划", "All plans") }, { value: 'bill', label: t("账单", "Bills") }, { value: 'income', label: t("定期收入", "Recurring income") }]} onChange={option => setType(option.value)} size="sm" /></div>}
    {visible.length ? <div className="recurring-records"><div className="recurring-columns finance-data-columns" aria-hidden="true"><span>{t("名称 / 周期", "Name / frequency")}</span><span>{t("下一日期", "Next date")}</span><span>{t("每期金额", "Amount per occurrence")}</span><span /></div><ul>{visible.map(record => {
      const next = summaries.get(record.id)?.nextOccurrenceDate;
      const occurrence = analysis?.upcoming.find(item => item.recurringId === record.id && item.occurrenceDate === next);
      return <li key={record.id}><button type="button" className="recurring-record finance-data-row" onClick={() => setModal({ type: 'view', record })} aria-label={t(`查看${record.name}${label}详情`, `View ${label.toLowerCase()} details for ${record.name}`)}><span className="recurring-record-identity"><strong className="finance-data-name">{record.name}</strong><span className="finance-data-meta">{cadenceLabel(record)}{record.kind === 'income' ? t("收款", " income") : ''}</span></span><span className="recurring-record-next"><time>{record.archived ? t("已归档", "Archived") : next || t("无后续计划", "No future occurrence")}</time>{!record.archived && next && next <= today() && <small className="finance-data-meta">{next === today() ? t("今日到期", "Due today") : t("待核对", "Needs review")}</small>}{occurrence && Number(occurrence.paidAmount) > 0 && <small className="finance-data-meta">{t("已记录部分付款", "Partial payment recorded")}</small>}</span><span className="recurring-record-money"><strong className="finance-data-amount">{money(record.amount, hidden)}</strong><small className="finance-data-meta">{record.currency}</small></span><ChevronRight aria-hidden="true" /></button></li>;
    })}</ul></div> : <EmptyMessage fill="none" className="journal-empty"><EmptyMessage.Icon><Document /></EmptyMessage.Icon><EmptyMessage.Title>{hasFilters ? t("没有匹配的记录", "No matching records") : status === 'archived' ? t("没有已归档计划", "No archived plans") : t(`还没有${label}记录`, `No ${label.toLowerCase()} yet`)}</EmptyMessage.Title><EmptyMessage.Description>{hasFilters ? type !== 'all' ? t("调整计划种类或搜索条件，查看其他记录。", "Change the plan type or search to see other records.") : t("试试其他名称、类别或账户。", "Try another name, category, or account.") : status === 'archived' ? t("归档后的计划可以在这里恢复。", "Archived plans can be restored here.") : t(`使用上方入口添加${label}金额与周期，查看下一期安排。`, `Add the amount and frequency above to see the next ${kind === "subscription" ? "subscription" : "bill"} occurrence.`)}</EmptyMessage.Description>{hasFilters && <EmptyMessage.ActionRow><Button pill={false} color="secondary" variant="outline" onClick={() => { setQuery(''); setType('all'); }}>{t("清除筛选", "Clear filters")}</Button></EmptyMessage.ActionRow>}</EmptyMessage>}
    {modal && <Dialog title={modal.type === 'create' ? t(`添加${label}`, `Add ${kind === "subscription" ? "subscription" : "bill"}`) : modal.type === 'edit' ? t(`编辑${kindLabel(modal.record.kind)}`, `Edit ${modal.record.kind === "subscription" ? "subscription" : modal.record.kind === "income" ? "recurring income" : "bill"}`) : modal.type === 'payment' ? t("记录本期交易", "Record this occurrence") : modal.record.name} className="finance-settings journal-dialog" onClose={() => setModal(null)}>{modal.type === 'create' || modal.type === 'edit' ? <RecurringPaymentForm state={state} kind={kind} record={modal.type === 'edit' ? modal.record : undefined} onSaved={saved} onCancel={() => setModal(null)} /> : modal.type === 'payment' ? <TransactionForm state={state} preset={modal.preset} onSaved={saved} onCancel={() => setModal(null)} /> : <RecurringDetails state={state} record={modal.record} hidden={hidden} onEdit={() => setModal({ type: 'edit', record: modal.record })} onPayment={preset => setModal({ type: 'payment', preset })} onSaved={saved} />}</Dialog>}
  </section>;
}
