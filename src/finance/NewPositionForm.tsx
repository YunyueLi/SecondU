import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Field } from '../components';
import { POSITION_TYPES } from '../../shared/asset-taxonomy.mjs';
import { financeRequest } from './api';
import { currencies, today } from './model';
import type { FinanceState } from './types';
import './finance-record-form.css';

export function NewPositionForm({ state, initialAccount, onSaved }: { state: FinanceState; initialAccount?: string; onSaved: (state: FinanceState) => void }) {
  const accounts = state.accounts.filter(account => account.canAddPosition === true);
  const formId = useId(), key = useRef(crypto.randomUUID());
  const [accountId, setAccountId] = useState(accounts.find(account => account.id === initialAccount)?.id || accounts[0]?.id || '');
  const [kind, setKind] = useState('stock'), [name, setName] = useState(''), [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState('US');
  const [quantity, setQuantity] = useState(''), [costPrice, setCostPrice] = useState(''), [recordedMarketValue, setValue] = useState('');
  const [currency, setCurrency] = useState(accounts.find(account => account.id === accountId)?.currency || 'USD');
  const [asOf, setAsOf] = useState(today()), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const changed = () => { key.current = crypto.randomUUID(); setError(''); };
  const securities = kind === 'stock' || kind === 'etf';
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setError('');
    if (!accounts.some(account => account.id === accountId)) { setError('请选择支持手动记录持仓的账户。'); return; }
    const number = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
    if (!number.test(quantity) || !number.test(recordedMarketValue) || (costPrice && !number.test(costPrice))) { setError('请填写有效的数量、市值与成本价。'); return; }
    setSaving(true);
    try {
      const result = await financeRequest<{ state: FinanceState }>('/positions', { idempotencyKey: key.current, accountId, name: name.trim(), symbol: symbol.trim().toUpperCase() || undefined, ...(securities ? { exchange } : kind === 'fund' && currency === 'CNY' && /^\d{6}$/.test(symbol.trim()) ? { exchange: 'CN' } : {}), kind, quantity, costPrice: costPrice || null, recordedMarketValue, currency, asOf });
      if (!result.state || result.state.revision == null) throw new Error('记录已提交，返回状态不完整。请保留输入并重试确认。');
      onSaved(result.state);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '持仓保存未完成，请重试。'); }
    finally { setSaving(false); }
  };
  return <form className="update-form finance-record-form" onSubmit={save}>
    <Field label="所属账户"><Select id={`${formId}-account`} value={accountId} options={accounts.map(account => ({ value: account.id, label: account.name }))} onChange={option => { setAccountId(option.value); changed(); }} disabled={saving} pill={false} /></Field>
    <Field label="产品类型"><Select id={`${formId}-kind`} value={kind} options={[...POSITION_TYPES]} onChange={option => { setKind(option.value); changed(); }} disabled={saving} pill={false} /></Field>
    <Field label="产品名称"><Input id={`${formId}-name`} value={name} onChange={event => { setName(event.target.value); changed(); }} required maxLength={160} disabled={saving} /></Field>
    <div className="finance-record-field-grid">
      <Field label="产品代码（可选）"><Input id={`${formId}-symbol`} value={symbol} onChange={event => { setSymbol(event.target.value); changed(); }} placeholder={securities ? '例如：AAPL' : kind === 'fund' ? '例如：六位基金代码' : '产品代码'} maxLength={60} disabled={saving} /></Field>
      {securities && <Field label="交易市场"><Select id={`${formId}-exchange`} value={exchange} options={[{ value: 'US', label: '美股' }, { value: 'HK', label: '港股' }, { value: 'CN', label: 'A 股' }]} onChange={option => { setExchange(option.value); changed(); }} disabled={saving} pill={false} /></Field>}
      <Field label="数量或份额"><Input id={`${formId}-quantity`} inputMode="decimal" value={quantity} onChange={event => { setQuantity(event.target.value); changed(); }} required disabled={saving} /></Field>
      <Field label="持仓币种"><Select id={`${formId}-currency`} value={currency} options={currencies} onChange={option => { setCurrency(option.value); changed(); }} disabled={saving} pill={false} /></Field>
      <Field label="成本均价（可选）"><Input id={`${formId}-cost`} inputMode="decimal" value={costPrice} onChange={event => { setCostPrice(event.target.value); changed(); }} disabled={saving} /></Field>
      <Field label={`当前市值（${currency}）`}><Input id={`${formId}-value`} inputMode="decimal" value={recordedMarketValue} onChange={event => { setValue(event.target.value); changed(); }} required disabled={saving} /></Field>
    </div>
    <Field label="持仓日期"><Input id={`${formId}-date`} type="date" value={asOf} onChange={event => { setAsOf(event.target.value); changed(); }} required disabled={saving} /></Field>
    <p className="form-footnote">持仓归入所属账户，不重复增加账户总资产。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><Button type="submit" color="primary" pill={false} loading={saving} disabled={!accounts.some(account => account.id === accountId)}>添加持仓</Button></div>
  </form>;
}
