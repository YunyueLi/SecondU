import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import type { FinanceRecurring, FinanceRecordInput } from '../../shared/finance-journal';
import { financeRequest } from './api';
import { today } from './model';
import { CATEGORY_LABELS } from './journal-categories';
import { JournalCategoryField, journalAccountOptions, journalCurrencyOptions } from './JournalFields';
import type { FinanceState } from './types';
import './journal-forms.css';

export function RecurringPaymentForm({ state, record, kind: defaultKind = 'bill', onSaved, onCancel }: {
  state: FinanceState; record?: FinanceRecurring; kind?: FinanceRecurring['kind'];
  onSaved: (state: FinanceState) => void | Promise<void>; onCancel?: () => void;
}) {
  const id = useId(), key = useRef(crypto.randomUUID());
  const [kind, setKind] = useState<FinanceRecurring['kind']>(record?.kind || defaultKind);
  const [name, setName] = useState(record?.name || ''), [amount, setAmount] = useState(record?.amount || '');
  const [currency, setCurrency] = useState(record?.currency || state.analysis?.currency || state.valuation?.currency || 'CNY');
  const [frequency, setFrequency] = useState<FinanceRecurring['frequency']>(record?.frequency || 'monthly');
  const [interval, setInterval] = useState(String(record?.interval || 1));
  const [anchorDate, setAnchorDate] = useState(record?.anchorDate || today()), [endDate, setEndDate] = useState(record?.endDate || '');
  const [accountId, setAccountId] = useState(record?.accountId || '');
  const [category, setCategory] = useState(record?.category || 'uncategorized');
  const [customCategory, setCustomCategory] = useState(Boolean(record?.category && !CATEGORY_LABELS[record.category]));
  const [subcategory, setSubcategory] = useState(record?.subcategory || ''), [note, setNote] = useState(record?.note || '');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const changed = () => { key.current = crypto.randomUUID(); setError(''); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setError('');
    if (!name.trim()) { setError('请填写账单或订阅名称。'); return; }
    if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(amount) || (kind === 'income' && Number(amount) <= 0)) { setError('请输入有效金额，最多保留两位小数；收入计划金额须大于零。'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate) || (frequency !== 'once' && endDate && endDate < anchorDate)) { setError('请选择首次发生日期，结束日期不能早于首次日期。'); return; }
    if (frequency !== 'once' && (!/^\d+$/.test(interval) || Number(interval) < 1 || Number(interval) > 120)) { setError('周期间隔需为 1 到 120 的整数。'); return; }
    if (customCategory && !category.trim()) { setError('请填写自定义类别名称。'); return; }
    setSaving(true);
    try {
      const input: FinanceRecordInput<'recurring'> = {
        id: record?.id, expectedRevision: record?.revision || 0, idempotencyKey: key.current,
        kind, name: name.trim(), amount, currency, anchorDate, endDate: frequency === 'once' ? null : endDate || null,
        frequency, interval: frequency === 'once' ? 1 : Number(interval), accountId: accountId || null,
        category: category.trim(), subcategory: subcategory.trim(), note: note.trim(), source: record?.source || { kind: 'manual' },
      };
      const result = await financeRequest<{ state: FinanceState }>('/journal/records/recurring', input);
      if (!result.state?.journal) throw new Error('记录已提交，尚未收到完整状态。请保留输入并重试确认。');
      try { await onSaved(result.state); }
      catch { setError('计划已保存，列表刷新未完成。请再次点击保存确认列表。'); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '计划保存失败，请重试。'); }
    finally { setSaving(false); }
  };
  return <form className="journal-form" onSubmit={save}>
    <div className="journal-field"><label htmlFor={`${id}-name`}>名称</label><Input id={`${id}-name`} value={name} onChange={event => { setName(event.target.value); changed(); }} placeholder={kind === 'subscription' ? '例如：音乐会员' : kind === 'income' ? '例如：每月工资' : '例如：房租、水电费'} maxLength={300} required disabled={saving} autoComplete="off" /></div>
    <div className="journal-field"><label htmlFor={`${id}-kind`}>计划类型</label><Select id={`${id}-kind`} pill={false} value={kind} options={[{ value: 'bill', label: '账单' }, { value: 'subscription', label: '订阅' }, { value: 'income', label: '定期收入' }]} onChange={option => { setKind(option.value as FinanceRecurring['kind']); changed(); }} disabled={saving} /></div>
    <div className="journal-form-grid journal-amount-grid">
      <div className="journal-field"><label htmlFor={`${id}-amount`}>每次金额</label><Input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); changed(); }} required placeholder="0.00" autoComplete="off" disabled={saving} /></div>
      <div className="journal-field"><label htmlFor={`${id}-currency`}>币种</label><Select id={`${id}-currency`} pill={false} value={currency} options={journalCurrencyOptions} onChange={option => { setCurrency(option.value); changed(); }} disabled={saving} /></div>
    </div>
    <div className="journal-form-grid">
      <div className="journal-field"><label htmlFor={`${id}-frequency`}>发生周期</label><Select id={`${id}-frequency`} pill={false} value={frequency} options={[{ value: 'once', label: '仅一次' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }, { value: 'quarterly', label: '每季度' }, { value: 'yearly', label: '每年' }]} onChange={option => { setFrequency(option.value as FinanceRecurring['frequency']); changed(); }} disabled={saving} /></div>
      {frequency !== 'once' && <div className="journal-field"><label htmlFor={`${id}-interval`}>每几个{frequency === 'weekly' ? '星期' : frequency === 'monthly' ? '月' : frequency === 'quarterly' ? '季度' : '年'}</label><Input id={`${id}-interval`} type="number" min="1" max="120" step="1" value={interval} onChange={event => { setInterval(event.target.value); changed(); }} required disabled={saving} /></div>}
    </div>
    <div className="journal-form-grid">
      <div className="journal-field"><label htmlFor={`${id}-anchor`}>{record ? '首次发生日期' : '首次或下一次日期'}</label><Input id={`${id}-anchor`} type="date" value={anchorDate} onChange={event => { setAnchorDate(event.target.value); changed(); }} required disabled={saving} /></div>
      {frequency !== 'once' && <div className="journal-field"><label htmlFor={`${id}-end`}>结束日期<span>（可选）</span></label><Input id={`${id}-end`} type="date" min={anchorDate} value={endDate} onChange={event => { setEndDate(event.target.value); changed(); }} disabled={saving} /></div>}
    </div>
    <div className="journal-field"><label htmlFor={`${id}-account`}>{kind === 'income' ? '收款账户' : '付款账户'}</label><Select id={`${id}-account`} pill={false} value={accountId} options={journalAccountOptions(state, accountId)} onChange={option => { setAccountId(option.value); changed(); }} disabled={saving} /></div>
    <div className="journal-form-grid">
      <div className="journal-field"><label htmlFor={`${id}-category`}>类别</label><JournalCategoryField id={`${id}-category`} value={category} custom={customCategory} kind={kind === 'income' ? 'income' : 'expense'} onChange={(value, custom) => { setCategory(value); setCustomCategory(custom); changed(); }} disabled={saving} /></div>
      <div className="journal-field"><label htmlFor={`${id}-subcategory`}>子类别<span>（可选）</span></label><Input id={`${id}-subcategory`} value={subcategory} onChange={event => { setSubcategory(event.target.value); changed(); }} maxLength={100} disabled={saving} /></div>
    </div>
    <div className="journal-field"><label htmlFor={`${id}-note`}>备注<span>（可选）</span></label><Textarea id={`${id}-note`} rows={2} value={note} onChange={event => { setNote(event.target.value); changed(); }} maxLength={1000} disabled={saving} /></div>
    <p className="journal-form-hint">保存计划后，按每期实际付款记录核对是否结清。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions">{onCancel && <Button color="secondary" variant="ghost" pill={false} disabled={saving} onClick={onCancel}>取消</Button>}<Button type="submit" color="primary" pill={false} loading={saving}>{record ? '保存修改' : '保存计划'}</Button></div>
  </form>;
}
