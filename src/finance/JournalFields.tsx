import { useId } from 'react';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { categoryOptions } from './journal-categories';
import type { FinanceState } from './types';

export const JOURNAL_CURRENCIES = ['CNY', 'CNH', 'USD', 'HKD', 'SGD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'KRW', 'MYR', 'TWD', 'INR', 'THB'];
export const journalCurrencyOptions = JOURNAL_CURRENCIES.map(value => ({ value, label: value }));
export const journalAccounts = (state: FinanceState) => [...state.accounts, ...state.liabilities];
export function accountLabel(state: FinanceState, id?: string | null) {
  if (!id) return '未指定账户';
  return [...journalAccounts(state), ...(state.archivedAccounts || [])].find(account => account.id === id)?.name || '已移除账户';
}
export function journalAccountOptions(state: FinanceState, existing?: string | null, includeArchived = false) {
  const options = [{ value: '', label: '未指定账户' }, ...journalAccounts(state).map(account => ({ value: account.id, label: account.name }))];
  if (includeArchived) for (const account of state.archivedAccounts || []) if (!options.some(option => option.value === account.id)) options.push({ value: account.id, label: `${account.name}（已归档）` });
  if (existing && !options.some(option => option.value === existing)) options.push({ value: existing, label: accountLabel(state, existing) });
  return options;
}
export function JournalCategoryField({ id, value, custom, onChange, disabled, kind = 'expense' }: {
  id?: string; value: string; custom: boolean; onChange: (value: string, custom: boolean) => void; disabled?: boolean; kind?: 'expense' | 'income' | 'transfer';
}) {
  const generated = useId();
  const controlId = id || generated;
  const options = [...categoryOptions(kind, value && !custom ? [value] : []), { value: '__custom__', label: '自定义类别' }];
  return <div className="journal-category-field"><Select id={controlId} pill={false} value={custom ? '__custom__' : value || 'uncategorized'} options={options} disabled={disabled} onChange={option => onChange(option.value === '__custom__' ? '' : option.value, option.value === '__custom__')} />{custom && <Input value={value} onChange={event => onChange(event.target.value, true)} aria-label="自定义类别名称" placeholder="填写类别名称" maxLength={100} disabled={disabled} required />}</div>;
}
