import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import type { FinanceTransaction, FinanceRecordInput } from '../../shared/finance-journal';
import { financeRequest } from './api';
import { today } from './model';
import { CATEGORY_LABELS } from './journal-categories';
import { JournalCategoryField, journalAccountOptions, journalCurrencyOptions } from './JournalFields';
import type { FinanceState } from './types';
import './journal-forms.css';

type EntryKind = FinanceTransaction['kind'] | 'refund';
export type TransactionPreset = Partial<Pick<FinanceTransaction, 'kind' | 'occurredOn' | 'amount' | 'currency' | 'merchant' | 'category' | 'subcategory' | 'accountId' | 'toAccountId' | 'recurringId' | 'recurringOccurrenceOn' | 'note'>>;
export function TransactionForm({ state, record, preset, onSaved, onCancel }: {
  state: FinanceState; record?: FinanceTransaction; preset?: TransactionPreset;
  onSaved: (state: FinanceState) => void | Promise<void>; onCancel?: () => void;
}) {
  const initial = record || preset;
  const id = useId(), key = useRef(crypto.randomUUID());
  const initialKind: EntryKind = initial?.kind === 'expense' && Number(initial.amount) < 0 ? 'refund' : initial?.kind || 'expense';
  const [kind, setKind] = useState<EntryKind>(initialKind);
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn || today());
  const [recurringOccurrenceOn, setRecurringOccurrenceOn] = useState(initial?.recurringOccurrenceOn || '');
  const [amount, setAmount] = useState(initial?.amount ? initialKind === 'refund' ? initial.amount.replace(/^-/, '') : initial.amount : '');
  const [currency, setCurrency] = useState(initial?.currency || state.analysis?.currency || state.valuation?.currency || 'CNY');
  const [merchant, setMerchant] = useState(initial?.merchant || '');
  const [category, setCategory] = useState(initial?.category || 'uncategorized');
  const [customCategory, setCustomCategory] = useState(Boolean(initial?.category && !CATEGORY_LABELS[initial.category]));
  const [subcategory, setSubcategory] = useState(initial?.subcategory || '');
  const [accountId, setAccountId] = useState(initial?.accountId || '');
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId || '');
  const [note, setNote] = useState(initial?.note || '');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const changed = () => { key.current = crypto.randomUUID(); setError(''); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving || record?.source.kind === 'connector') return; setError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || occurredOn > today()) { setError('请选择已经发生的交易日期。'); return; }
    if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(amount) || (kind !== 'expense' && Number(amount) <= 0)) { setError('请输入有效金额，最多保留两位小数；收入、退款和转账金额须大于零。'); return; }
    if (kind === 'transfer' && accountId && accountId === toAccountId) { setError('转出与转入账户不能相同。'); return; }
    if (customCategory && !category.trim()) { setError('请填写自定义类别名称。'); return; }
    setSaving(true);
    try {
      const input: FinanceRecordInput<'transactions'> = {
        id: record?.id, expectedRevision: record?.revision || 0, idempotencyKey: key.current,
        kind: kind === 'refund' ? 'expense' : kind, occurredOn, amount: kind === 'refund' ? `-${amount}` : amount,
        currency, merchant: merchant.trim(), category: category.trim(), subcategory: subcategory.trim(),
        accountId: accountId || null, toAccountId: kind === 'transfer' ? toAccountId || null : null,
        recurringId: initial?.recurringId || null, recurringOccurrenceOn: recurringOccurrenceOn || null,
        note: note.trim(), source: record?.source || { kind: 'manual' },
      };
      const result = await financeRequest<{ state: FinanceState }>('/journal/records/transactions', input);
      if (!result.state?.journal) throw new Error('记录已提交，尚未收到完整状态。请保留输入并重试确认。');
      try { await onSaved(result.state); }
      catch { setError('交易已保存，列表刷新未完成。请再次点击保存确认列表。'); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '交易保存失败，请重试。'); }
    finally { setSaving(false); }
  };
  if (record?.source.kind === 'connector') return <div className="journal-form"><p>此交易由已连接账户同步，无法在此编辑。请在来源账户更正后重新同步。</p><div className="journal-form-actions">{onCancel && <Button color="secondary" variant="ghost" pill={false} onClick={onCancel}>返回</Button>}<ButtonLink href="#settings/connectors" color="primary" pill={false}>管理连接</ButtonLink></div></div>;
  return <form className="journal-form" onSubmit={save}>
    <div className="journal-form-grid">
      <div className="journal-field"><label htmlFor={`${id}-kind`}>交易类型</label><Select id={`${id}-kind`} pill={false} value={kind} disabled={saving} options={[{ value: 'expense', label: '支出' }, { value: 'income', label: '收入' }, { value: 'refund', label: '支出退款' }, { value: 'transfer', label: '账户间转账' }]} onChange={option => { setKind(option.value as EntryKind); changed(); }} /></div>
      <div className="journal-field"><label htmlFor={`${id}-date`}>交易日期</label><Input id={`${id}-date`} type="date" max={today()} value={occurredOn} onChange={event => { setOccurredOn(event.target.value); changed(); }} required disabled={saving} /></div>
    </div>
    {initial?.recurringId && <div className="journal-field"><label htmlFor={`${id}-occurrence`}>对应账单日期</label><Input id={`${id}-occurrence`} type="date" value={recurringOccurrenceOn} onChange={event => { setRecurringOccurrenceOn(event.target.value); changed(); }} required disabled={saving} /><p className="journal-form-hint">填写这笔付款或收款对应的计划日期，可补记往期账单。交易日期仍填写实际发生日。</p></div>}
    <div className="journal-form-grid journal-amount-grid">
      <div className="journal-field"><label htmlFor={`${id}-amount`}>{kind === 'refund' ? '退款金额' : '原币金额'}</label><Input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); changed(); }} placeholder="0.00" required autoComplete="off" disabled={saving} /></div>
      <div className="journal-field"><label htmlFor={`${id}-currency`}>币种</label><Select id={`${id}-currency`} pill={false} value={currency} options={journalCurrencyOptions} onChange={option => { setCurrency(option.value); changed(); }} disabled={saving} /></div>
    </div>
    <div className="journal-field"><label htmlFor={`${id}-merchant`}>{kind === 'income' ? '收入来源' : kind === 'transfer' ? '转账说明' : '商户或交易对象'}<span>（可选）</span></label><Input id={`${id}-merchant`} value={merchant} onChange={event => { setMerchant(event.target.value); changed(); }} maxLength={300} disabled={saving} placeholder={kind === 'income' ? '例如：工资、稿费' : '例如：商店、餐厅'} autoComplete="off" /></div>
    <div className="journal-form-grid">
      <div className="journal-field"><label htmlFor={`${id}-category`}>类别</label><JournalCategoryField id={`${id}-category`} value={category} custom={customCategory} kind={kind === 'income' ? 'income' : 'expense'} onChange={(value, custom) => { setCategory(value); setCustomCategory(custom); changed(); }} disabled={saving} /></div>
      <div className="journal-field"><label htmlFor={`${id}-subcategory`}>子类别<span>（可选）</span></label><Input id={`${id}-subcategory`} value={subcategory} onChange={event => { setSubcategory(event.target.value); changed(); }} maxLength={100} disabled={saving} placeholder="进一步分类" /></div>
    </div>
    <div className={kind === 'transfer' ? 'journal-form-grid' : undefined}>
      <div className="journal-field"><label htmlFor={`${id}-account`}>{kind === 'transfer' ? '转出账户' : kind === 'income' || kind === 'refund' ? '收款账户' : '付款账户'}</label><Select id={`${id}-account`} pill={false} value={accountId} options={journalAccountOptions(state, accountId)} onChange={option => { setAccountId(option.value); changed(); }} disabled={saving} /></div>
      {kind === 'transfer' && <div className="journal-field"><label htmlFor={`${id}-to-account`}>转入账户</label><Select id={`${id}-to-account`} pill={false} value={toAccountId} options={journalAccountOptions(state, toAccountId).filter(option => !option.value || option.value !== accountId)} onChange={option => { setToAccountId(option.value); changed(); }} disabled={saving} /></div>}
    </div>
    <div className="journal-field"><label htmlFor={`${id}-note`}>备注<span>（可选）</span></label><Textarea id={`${id}-note`} rows={2} value={note} onChange={event => { setNote(event.target.value); changed(); }} maxLength={1000} disabled={saving} /></div>
    {kind === 'refund' && <p className="journal-form-hint">退款会冲减所选类别的支出，保留退款发生日期。</p>}
    {kind === 'transfer' && <p className="journal-form-hint">转账单独记录，收支统计会排除这笔金额。账户余额单独维护。</p>}
    {initial?.recurringId && <p className="journal-form-hint">这笔记录关联 {recurringOccurrenceOn} 的账单；保存后按实际金额核对本期付款。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions">{onCancel && <Button color="secondary" variant="ghost" pill={false} disabled={saving} onClick={onCancel}>取消</Button>}<Button type="submit" color="primary" pill={false} loading={saving}>{record ? '保存修改' : '保存交易'}</Button></div>
  </form>;
}
