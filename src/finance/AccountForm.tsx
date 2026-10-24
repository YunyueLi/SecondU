import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Field } from '../components';
import { ASSET_TYPES, LIABILITY_TYPES, accountTypeOf, accountTypeLabel, isValuedAssetType, ownedAssetValue } from '../../shared/asset-taxonomy.mjs';
import { AssetDetailsFields, assetDetailsDraft, assetDetailsPayload } from './AssetDetailsFields';
import { FinanceTypeOption } from './FinanceIcon';
import { financeRequest } from './api';
import { currencies, date, money, today } from './model';
import type { FinanceAccount, FinanceState } from './types';
import './finance-record-form.css';

export function AccountForm({ account, kind = 'asset', displayCurrency = 'CNY', hidden, onSaved, submitLabel, state, forPositions = false }: {
  account?: FinanceAccount; kind?: 'asset' | 'liability'; displayCurrency?: string; hidden: boolean;
  onSaved: (state: FinanceState, id?: string) => void | Promise<void>; submitLabel?: string; state?: FinanceState; forPositions?: boolean;
}) {
  const formId = useId(), key = useRef(crypto.randomUUID());
  const [name, setName] = useState(account?.name || '');
  const [currency, setCurrency] = useState(account?.currency || displayCurrency);
  const [amount, setAmount] = useState('');
  const [asOf, setAsOf] = useState(today());
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');
  const [classification, setClassification] = useState<string>(account ? accountTypeOf(account) : kind === 'liability' ? 'other' : forPositions ? 'investment' : 'cash');
  const [details, setDetails] = useState(() => assetDetailsDraft(account));
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const changed = () => { key.current = crypto.randomUUID(); setError(''); };
  const liability = (account?.kind || kind) === 'liability';
  const classificationOptions = (liability ? [...LIABILITY_TYPES] : ASSET_TYPES.filter(option => !forPositions || !isValuedAssetType(option.value)))
    .map(option => ({ ...option, iconKind: liability && option.value === 'other' ? 'other_liability' : option.value }));
  const valued = !liability && isValuedAssetType(classification) && (!account || account.canEditAssetDetails === true);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setError('');
    if (!account && !name.trim()) { setError('请填写账户名称。'); return; }
    if (forPositions && (liability || isValuedAssetType(classification))) { setError('请为投资持仓选择现金、投资或其他账户。'); return; }
    const ownedAmount = valued ? ownedAssetValue(details.totalValue, details.ownershipPercent) : amount;
    if (ownedAmount === null || !/^\d+(?:\.\d{1,2})?$/.test(ownedAmount)) { setError(valued ? '请填写有效总估值与本人持有比例（大于 0 且不超过 100%）。' : '请输入有效的非负金额，最多保留两位小数。'); return; }
    setSaving(true);
    try {
      const payload = account
        ? { idempotencyKey: key.current, accountId: account.id, kind: account.kind, amount: ownedAmount, currency: account.currency, asOf, note: note.trim() || (valued ? '手动更新资产估值' : '手动更新账户记录'), ...(account.canEditAssetDetails ? { expectedAccountRevision: account.accountRevision } : {}), ...(valued ? { assetType: classification, assetDetails: assetDetailsPayload(details, classification, asOf) } : {}) }
        : { idempotencyKey: key.current, name: name.trim(), kind, amount: ownedAmount, currency, asOf, description: description.trim(), ...(liability ? { liabilityType: classification } : { assetType: classification }), ...(valued ? { assetDetails: assetDetailsPayload(details, classification, asOf) } : {}) };
      const result = await financeRequest<{ state: FinanceState; accountId?: string }>(account ? '/updates' : '/accounts', payload);
      if (!result.state || result.state.revision == null) throw new Error('记录已提交，返回状态不完整。请保留输入并重试确认。');
      await onSaved(result.state, result.accountId || account?.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '保存未完成，请重试。'); }
    finally { setSaving(false); }
  };
  return <form className="update-form finance-record-form finance-account-form" onSubmit={save}>
    {account ? <p className="form-footnote">{accountTypeLabel(account)}，当前{liability ? '待偿' : '记录'} {money(account.bookAmount || account.amount, hidden)} {account.currency}，{date(account.asOf)}</p> : <>
      <Field label={liability ? '负债类型' : '资产类型'}><Select id={`${formId}-type`} value={classification} options={classificationOptions} OptionView={FinanceTypeOption} TriggerView={FinanceTypeOption} onChange={option => { setClassification(option.value); changed(); }} disabled={saving} pill={false} /></Field>
      <Field label={liability ? '负债名称' : valued ? '资产名称' : '账户名称'}><Input id={`${formId}-name`} value={name} onChange={event => { setName(event.target.value); changed(); }} placeholder={liability ? '例如：信用卡、住房贷款' : valued ? '例如：自住房、车辆或保单名称' : '例如：储蓄账户、证券账户'} autoComplete="off" maxLength={100} required disabled={saving} /></Field>
      <Field label={valued ? '估值币种' : '账户币种'}><Select id={`${formId}-currency`} value={currency} options={currencies} onChange={option => { setCurrency(option.value); changed(); }} disabled={saving} pill={false} /></Field>
    </>}
    {valued ? <AssetDetailsFields assetType={classification} currency={currency} asOf={asOf} draft={details} onChange={next => { setDetails(next); changed(); }} state={state} disabled={saving} hidden={hidden} /> : <Field label={`${liability ? '待偿金额' : account ? '新的账户余额' : '当前账户余额'}（${currency}）`}><Input id={`${formId}-amount`} inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); changed(); }} placeholder="0.00" required autoComplete="off" disabled={saving} /></Field>}
    <Field label={valued ? '估值日期' : '记录日期'}><Input id={`${formId}-date`} type="date" value={asOf} onChange={event => { setAsOf(event.target.value); changed(); }} required disabled={saving} /></Field>
    <Field label={`${account ? '记录说明' : '账户说明'}（可选）`}><Textarea id={`${formId}-note`} rows={2} value={account ? note : description} onChange={event => { account ? setNote(event.target.value) : setDescription(event.target.value); changed(); }} placeholder={liability ? '例如：账单日或还款安排' : '例如：包含现金与基金的账户总额'} maxLength={500} disabled={saving} /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><Button type="submit" color="primary" pill={false} loading={saving}>{submitLabel || (account ? '保存更新' : liability ? '添加负债' : valued ? '添加资产' : '添加账户')}</Button></div>
  </form>;
}
