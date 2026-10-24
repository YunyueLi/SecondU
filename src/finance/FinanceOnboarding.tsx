import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { ArrowLeft, ArrowRight, ChevronDown, CreditCard, Link, Plus } from '@openai/apps-sdk-ui/components/Icon';
import { AccountForm } from './AccountForm';
import { BrandIcon } from './BrandIcon';
import { accountBrand, accountDescription, accountStatus, currencies, money } from './model';
import { financeRequest } from './api';
import type { FinanceState, OnboardingPreferences } from './types';

export function FinanceOnboarding({ state, hidden, onSaved }: { state: FinanceState; hidden: boolean; onSaved: (state: FinanceState) => void }) {
  const initial = state.metadata?.onboarding;
  const [currency, setCurrency] = useState(initial?.displayCurrency || 'CNY');
  const [step, setStep] = useState<'choose' | 'manual' | 'preview'>(state.accounts.length ? 'preview' : 'choose');
  const [method, setMethod] = useState<OnboardingPreferences['method']>(initial?.method);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const save = async (completed: boolean, nextMethod = method) => {
    setSaving(true); setError('');
    try {
      const result = await financeRequest<{ state: FinanceState }>('/onboarding', { completed, displayCurrency: currency, method: nextMethod }, 'PUT');
      if (!result.state) throw new Error('设置尚未保存，请重试。');
      onSaved(result.state); return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '设置尚未保存，请重试。'); return false; }
    finally { setSaving(false); }
  };
  const connect = async () => {
    setMethod('connector');
    if (await save(false, 'connector')) location.hash = 'settings/connectors';
  };
  const hasAccounts = state.accounts.length > 0;
  const previewRows = (accounts: FinanceState['accounts']) => <ul className="finance-onboarding-preview">{accounts.map(account => <li key={account.id}><BrandIcon id={accountBrand(account)} size={28} /><span><strong>{account.name}</strong><small>{accountDescription(account)}，{accountStatus(account)}</small></span><strong>{money(account.amount, hidden)} <small>{account.currency}</small></strong></li>)}</ul>;
  return <section className="finance-onboarding" aria-labelledby="finance-onboarding-title">
    <header><CreditCard aria-hidden="true" /><h2 id="finance-onboarding-title">{step === 'manual' ? '添加第一个账户' : hasAccounts ? '账户已准备好' : '把账户放在一起'}</h2><p>{step === 'manual' ? '从一个常用账户开始，其他账户可以稍后补充。' : hasAccounts ? `已找到 ${state.accounts.length} 个账户。选择展示币种后，即可查看资产全景。` : initial?.method === 'connector' ? '完成连接后返回这里，即可查看账户预览。' : '连接已有账户，或先手动记录余额。'}</p></header>
    {step !== 'manual' && <div className="finance-onboarding-currency"><label htmlFor="finance-display-currency">汇总展示币种</label><div className="finance-onboarding-currency-select"><Select id="finance-display-currency" value={currency} options={currencies} onChange={option => setCurrency(option.value)} pill={false} disabled={saving} /></div></div>}
    {error && <Alert color="danger" variant="soft" title="设置未保存" description={error} />}
    {step === 'choose' && <div className="finance-onboarding-choices"><Button color="primary" pill={false} size="lg" onClick={() => void connect()} loading={saving}><Link />连接账户<ArrowRight /></Button><Button color="secondary" variant="outline" pill={false} size="lg" disabled={saving} onClick={() => { setMethod('manual'); setStep('manual'); }}><Plus />手动记录账户</Button></div>}
    {step === 'manual' && <><Button color="secondary" variant="ghost" pill={false} onClick={() => setStep('choose')}><ArrowLeft />返回</Button><AccountForm hidden={hidden} displayCurrency={currency} submitLabel="保存并预览" onSaved={next => { onSaved(next); setMethod('manual'); setStep('preview'); }} /></>}
    {step === 'preview' && <><div className="finance-onboarding-accounts">{previewRows(state.accounts.slice(0, 4))}{state.accounts.length > 4 && <details className="finance-onboarding-more"><summary>查看全部 {state.accounts.length} 个账户<ChevronDown aria-hidden="true" /></summary>{previewRows(state.accounts.slice(4))}</details>}</div><div className="finance-onboarding-actions"><Button color="secondary" variant="ghost" pill={false} disabled={saving} onClick={() => { setMethod('manual'); setStep('manual'); }}><Plus />继续添加</Button><Button color="primary" pill={false} loading={saving} onClick={() => void save(true, method || 'connector')}>进入财务总览<ArrowRight /></Button></div></>}
    {step === 'choose' && <Button className="finance-onboarding-skip" color="secondary" variant="ghost" pill={false} disabled={saving} onClick={() => void save(true, 'later')}>稍后添加</Button>}
  </section>;
}
