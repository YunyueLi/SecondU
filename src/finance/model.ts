import type { FinanceAccount, FinanceState } from './types';
import {isValuedAssetType} from '../../shared/asset-taxonomy.mjs';
import {getLocale, subscribeLocale, t} from '../i18n.ts';
import {financeAssetTypeLabel} from './labels.ts';

const currencyOptions = () => [
  { value: 'CNY', label: t('人民币 CNY', 'Chinese yuan CNY') }, { value: 'USD', label: t('美元 USD', 'US dollar USD') },
  { value: 'HKD', label: t('港元 HKD', 'Hong Kong dollar HKD') }, { value: 'SGD', label: t('新加坡元 SGD', 'Singapore dollar SGD') },
  { value: 'CNH', label: t('离岸人民币 CNH', 'Offshore yuan CNH') }, { value: 'EUR', label: t('欧元 EUR', 'Euro EUR') },
  { value: 'GBP', label: t('英镑 GBP', 'Pound sterling GBP') }, { value: 'JPY', label: t('日元 JPY', 'Japanese yen JPY') },
  { value: 'AUD', label: t('澳元 AUD', 'Australian dollar AUD') }, { value: 'CAD', label: t('加元 CAD', 'Canadian dollar CAD') },
];
export let currencies = currencyOptions();
subscribeLocale(() => { currencies = currencyOptions(); });
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
function exactDecimal(value: unknown) {
  const match = String(value ?? '').match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const fraction = match[3] || '';
  return { n: BigInt(match[2] + fraction) * (match[1] === '-' ? -1n : 1n), d: 10n ** BigInt(fraction.length) };
}
function exactMoney(n: bigint, d: bigint) {
  const magnitude = n < 0n ? -n : n;
  const cents = (magnitude * 200n + d) / (2n * d);
  return decimal(n < 0n ? -cents : cents);
}
export const money = (value: unknown, hidden = false) => {
  if (hidden) return '••••';
  const amount = exactDecimal(value);
  if (!amount) return '—';
  const rounded = exactMoney(amount.n, amount.d), [whole, cents] = rounded.split('.');
  return `${whole.startsWith('-') ? '-' : ''}${BigInt(whole.replace('-', '')).toLocaleString(getLocale())}.${cents}`;
};
export const date = (value?: string | null) => {
  if (!value) return t('日期待补充', 'Date not provided');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return t('日期待补充', 'Date not provided');
  return parsed.toLocaleDateString(getLocale(), { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
};
export const minor = (value: unknown) => {
  const match = String(value ?? '').match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  return match ? (BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0').slice(0, 2))) * (match[1] === '-' ? -1n : 1n) : 0n;
};
export const decimal = (value: bigint) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;
export const providerNames: Record<string, string> = {
  get cmb() { return t('招商银行', 'China Merchants Bank'); },
  get icbc() { return t('工商银行', 'ICBC'); },
  get boc() { return t('中国银行', 'Bank of China'); },
  get abc() { return t('农业银行', 'Agricultural Bank of China'); },
  dbs: 'DBS', get scb() { return t('渣打银行', 'Standard Chartered'); },
  moomoo: 'Moomoo', ibkr: 'IBKR', get hsbc() { return t('汇丰银行', 'HSBC'); },
  get bochk() { return t('中银香港', 'Bank of China (Hong Kong)'); },
  get alipay() { return t('支付宝', 'Alipay'); },
};
export function accountBrand(account: FinanceAccount) {
  const institution = typeof account.institution === 'string' ? account.institution : account.institution?.id;
  const explicit = institution?.trim() || (account.provider !== 'manual' ? account.provider : undefined);
  return explicit || Object.keys(providerNames).find(id => account.id === id || account.id.startsWith(`${id}-`)) || account.id;
}
export function accountDescription(account: FinanceAccount) {
  if(isValuedAssetType(account.assetType))return financeAssetTypeLabel(account.assetType!);
  return account.description || account.categoryLabel || (account.kind === 'liability' ? t('待偿金额', 'Amount owed') : account.readOnly ? t('已连接账户', 'Connected account') : account.balance_kind === 'market_value' ? t('持仓市值', 'Holding value') : account.balance_kind === 'available_balance' ? t('可用余额', 'Available balance') : t('账户余额', 'Account balance'));
}
export function accountStatus(account: FinanceAccount) {
  return account.readStatus === 'stale' || account.projection?.status === 'stale' ? t('保留上次值', 'Previous value') : account.projection?.reconciliationRequired ? t('余额待核对', 'Balance needs review') : `${date(account.providerAsOf || account.asOf)}${account.readOnly ? t('，已连接', ', connected') : ''}`;
}
export function displayAccounts(state: FinanceState): FinanceAccount[] {
  return state.accounts.map(account => {
    const projection = state.portfolio?.accounts?.find((item: any) => item.accountId === account.id);
    return { ...account, bookAmount: account.amount, amount: projection?.estimatedAmount ?? account.amount, projection };
  });
}
export function positionsFor(state: FinanceState) {
  const recorded: any[] = state.positions?.items || [];
  const projected: any[] = state.portfolio?.holdings || [];
  const merged = recorded.map(item => {
    const valuation = projected.find(row => row.id === item.id || row.id === item.positionId || (row.accountId === item.accountId && row.symbol && row.symbol === item.symbol));
    return { ...item, valuation, symbol: item.symbol || item.name || item.id, name_display: item.name || item.symbol, market_value: item.recordedMarketValue, cost_price: item.costPrice, last_price: item.recordedPrice, holding_pnl: item.recordedHoldingPnl };
  });
  for (const valuation of projected) {
    if (merged.some(item => item.valuation === valuation)) continue;
    merged.push({ ...valuation, valuation, id: valuation.id, positionId: valuation.id, symbol: valuation.symbol || valuation.name || valuation.id, name_display: valuation.name || valuation.symbol, currency: valuation.recordedCurrency || valuation.valuationCurrency || valuation.currency, market_value: valuation.baselineMarketValue, cost_price: valuation.costPrice, last_price: valuation.baselinePrice, holding_pnl: valuation.recordedHoldingPnl, editable: !valuation.readOnly });
  }
  return merged;
}
export function accountAmount(state: FinanceState, account: FinanceAccount, currency: string): string | null {
  const amount = exactDecimal(account.amount);
  if (!amount) return null;
  if (account.currency === currency) return exactMoney(amount.n, amount.d);
  const valuation = state.portfolio?.convertedAccounts ? state.portfolio : state.valuation;
  const displayCurrency = valuation.baseCurrency || valuation.currency || 'CNY';
  const converted = (valuation.convertedAccounts || []).find((row: any) => row.accountId === account.id && (!row.kind || row.kind === account.kind));
  const original = exactDecimal(converted?.originalAmount);
  if (currency === displayCurrency && converted && (converted.originalAmount === undefined || original && original.n * amount.d === amount.n * original.d)) {
    const value = exactDecimal(converted.amount);
    return value ? exactMoney(value.n, value.d) : null;
  }
  // Provider rates remain CNY-based when the user changes the display currency.
  const rates = valuation.rates || state.valuation?.rates || [];
  const rateFor = (code: string) => code === 'CNY' ? { n: 1n, d: 1n } : exactDecimal([...rates].reverse().find((row: any) => row.currency === code && (!row.baseCurrency || row.baseCurrency === 'CNY'))?.rate);
  const sourceRate = rateFor(account.currency), targetRate = rateFor(currency);
  if (!sourceRate || sourceRate.n <= 0n || !targetRate || targetRate.n <= 0n) return null;
  return exactMoney(amount.n * sourceRate.n * targetRate.d, amount.d * sourceRate.d * targetRate.n);
}
export function summaryFor(state: FinanceState, currency: string, nativeCurrency?: string) {
  const accounts = displayAccounts(state).filter(account => !nativeCurrency || account.currency === nativeCurrency);
  const liabilities = state.liabilities.filter(account => !nativeCurrency || account.currency === nativeCurrency);
  const sum = (rows: FinanceAccount[]) => {
    const values = rows.map(row => accountAmount(state, row, currency));
    return values.some(value => value === null) ? null : decimal(values.reduce<bigint>((total, value) => total + minor(value), 0n));
  };
  const assets = sum(accounts), debt = sum(liabilities);
  const reconciliationRequiredAccounts = accounts.filter(account => account.projection?.reconciliationRequired);
  const conversionComplete = assets !== null && debt !== null;
  return { accounts, liabilityCount: liabilities.length, assets, liabilities: debt, net: conversionComplete ? decimal(minor(assets) - minor(debt)) : null, conversionComplete, reconciliationRequiredAccounts, complete: conversionComplete && reconciliationRequiredAccounts.length === 0 };
}
