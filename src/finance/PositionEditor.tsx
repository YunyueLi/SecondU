import { financeUrl } from './api';
import { useRef, useState } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Field } from '../components';
import './finance-record-form.css';

export function PositionEditor({ state, initialId, hidden, onSaved }: { state: any; initialId?: string; hidden: boolean; onSaved: (next: any) => Promise<void> }) {
  const items = (state.positions?.items || []).filter((item: any) => item.editable && !state.accounts.find((account: any) => account.id === item.accountId)?.readOnly);
  const [id, setId] = useState(items.some((item: any) => (item.positionId || item.id) === initialId) ? initialId : items[0]?.positionId || items[0]?.id || '');
  const item = items.find((row: any) => (row.positionId || row.id) === id);
  const [quantity, setQuantity] = useState(hidden ? '' : item?.quantity || '');
  const [cost, setCost] = useState(hidden ? '' : item?.costPrice || '');
  const [costTouched, setCostTouched] = useState(false);
  const [value, setValue] = useState(hidden ? '' : item?.recordedMarketValue || '');
  const [currency, setCurrency] = useState(item?.currency || '');
  const [asOf, setAsOf] = useState(item?.asOf?.slice(0, 10) || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()));
  const account = state.accounts.find((row: any) => row.id === item?.accountId);
  const [reconcile, setReconcile] = useState(Boolean(state.portfolio?.accounts.find((row: any) => row.accountId === item?.accountId)?.reconciliationRequired));
  const [accountAmount, setAccountAmount] = useState('');
  const [note, setNote] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const expectedRevision = useRef(state.positions?.revision), baseMarker = useRef(item?.currentAccountBaseMarker), key = useRef(crypto.randomUUID());
  const changed = () => { key.current = crypto.randomUUID(); setError(''); };
  const choose = (nextId: string) => {
    const next = items.find((row: any) => (row.positionId || row.id) === nextId);
    setId(nextId); setCostTouched(false); setAccountAmount(''); setReconcile(Boolean(state.portfolio?.accounts.find((row: any) => row.accountId === next?.accountId)?.reconciliationRequired)); setQuantity(hidden ? '' : next?.quantity || ''); setCost(hidden ? '' : next?.costPrice || ''); setValue(hidden ? '' : next?.recordedMarketValue || ''); setCurrency(next?.currency || ''); setAsOf(next?.asOf?.slice(0, 10) || asOf);
    baseMarker.current = next?.currentAccountBaseMarker; expectedRevision.current = state.positions?.revision; changed();
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const decimal = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
    if (!currency) { setError('请选择这项持仓的币种。'); return; }
    if (!decimal.test(quantity) || !decimal.test(value) || (cost && !decimal.test(cost))) { setError('数量、市值和成本价需为有效的非负数字。'); return; }
    if (reconcile && !/^\d+(?:\.\d{1,2})?$/.test(accountAmount)) { setError('请输入同一日期的账户总额，最多保留两位小数。'); return; }
    setSaving(true);
    try {
      const response = await fetch(financeUrl('/positions/updates'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: key.current, positionId: id, accountId: item.accountId, expectedRevision: expectedRevision.current, baseMarker: baseMarker.current, quantity, costPrice: hidden && !costTouched ? item.costPrice ?? null : cost || null, currency, asOf, recordedMarketValue: value, note: note.trim() || '通过财务工作台更新持仓记录', ...(reconcile ? { accountBalance: { amount: accountAmount, currency: account.currency, asOf } } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || result.error || '持仓保存失败，请重试。');
      if (!result.state?.revision) throw new Error("记录已提交，返回状态不完整。请保留输入并重试确认。");
      await onSaved(result.state);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '持仓保存失败，请重试。'); }
    finally { setSaving(false); }
  };
  if (!item) return <Alert color="info" variant="soft" title="正在准备持仓记录" description="可编辑持仓加载后，即可更新数量、成本和记录市值。" />;
  return <form className="update-form finance-record-form position-editor" onSubmit={save}>
    <Field label="持仓"><Select pill={false} id="position-id" value={id} onChange={option => choose(option.value)} disabled={saving} options={items.map((row: any) => ({ value: row.positionId || row.id, label: row.name || row.symbol || row.positionId, description: `${state.accounts.find((account: any) => account.id === row.accountId)?.name || row.accountId}，${row.symbol || ''}` }))} /></Field>
    <div className="finance-record-field-grid">
      <Field label="持有数量"><Input id="position-quantity" inputMode="decimal" value={quantity} onChange={event => { setQuantity(event.target.value); changed(); }} placeholder="数量或份额" required disabled={saving} /></Field>
      <Field label="持仓币种"><Select pill={false} id="position-currency" placeholder="选择币种" value={currency} onChange={option => { setCurrency(option.value); changed(); }} options={['USD', 'HKD', 'CNY', 'CNH', 'SGD'].map(code => ({ value: code, label: code }))} disabled={saving || Boolean(item.identity?.currency)} /></Field>
      <Field label="成本均价（可选）"><Input id="position-cost" inputMode="decimal" value={cost} onChange={event => { setCost(event.target.value); setCostTouched(true); changed(); }} placeholder={hidden && !costTouched ? "留空保留原成本" : "按券商显示填写"} disabled={saving} /></Field>
      <Field label={`记录市值（${currency}）`}><Input id="position-value" inputMode="decimal" value={value} onChange={event => { setValue(event.target.value); changed(); }} placeholder="券商显示的持仓市值" required disabled={saving} /></Field>
    </div>
    <Field label="持仓日期"><Input id="position-date" type="date" value={asOf} onChange={event => { setAsOf(event.target.value); changed(); }} required disabled={saving} /></Field>
    <div className="finance-record-reconcile"><Checkbox checked={reconcile} onCheckedChange={value => { setReconcile(value); changed(); }} label="同时核对账户总额" disabled={saving} />{reconcile && <Field label={`${account?.name}总额（${account?.currency}）`}><Input id="position-account-amount" inputMode="decimal" value={accountAmount} onChange={event => { setAccountAmount(event.target.value); changed(); }} placeholder="包含持仓与现金的账户总资产" required disabled={saving} /></Field>}<p className="form-footnote">{reconcile ? '使用同一天的账户总额和持仓市值建立估值基准。其他持仓需逐项核对后恢复联动。' : '只保存持仓时，所属账户暂按记录余额汇总，核对账户总额后恢复估值。'}</p></div>
    <Field label="记录说明（可选）"><Textarea id="position-note" rows={2} value={note} onChange={event => { setNote(event.target.value); changed(); }} maxLength={500} placeholder="例如：券商 App 中的最新持仓" disabled={saving} /></Field>

    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><Button type="submit" color="primary" pill={false} loading={saving}>保存持仓</Button></div>
  </form>;
}
