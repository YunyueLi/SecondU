import type { FinanceAccount, FinanceState } from './types';

type RecordValue = Record<string, any>;
export type AccountSummaryFact = { label: string; amount: string; currency: string };
const record = (value: unknown): RecordValue | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
const decimal = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  return /^-?\d+(?:\.\d+)?$/.test(raw) ? raw : null;
};
const firstAmount = (source: RecordValue | undefined, fields: string[]) => {
  for (const field of fields) { const amount = decimal(source?.[field]); if (amount !== null) return amount; }
  return null;
};

function accountDetails(state: FinanceState, account: FinanceAccount) {
  if (account.detailCurrent === false) return undefined;
  const own = record(account.funds) || record(account.details);
  if (own) return own;
  const details = record(state.displayData?.details) || record(state.snapshot?.details);
  if (!details) return undefined;
  if (account.detailKey && record(details[account.detailKey])) return record(details[account.detailKey]);
  if (record(details[account.id])) return record(details[account.id]);
  const explicit = Object.values(details).map(record).filter(detail => detail?.accountId === account.id);
  if (explicit.length === 1) return explicit[0];
  const matches = Object.keys(details).filter(key => account.id.startsWith(`${key}-`) || account.id.startsWith(`${key}_`));
  if (matches.length !== 1) return undefined;
  const key = matches[0];
  const siblings = state.accounts.filter(item => item.id === key || item.id.startsWith(`${key}-`) || item.id.startsWith(`${key}_`));
  return siblings.length === 1 ? record(details[key]) : undefined;
}

export function accountSummaryFor(state: FinanceState, accountId: string): AccountSummaryFact[] {
  const account = state.accounts.find(item => item.id === accountId);
  if (!account) return [];
  const detail = accountDetails(state, account);
  const currency = typeof detail?.currency === 'string' ? detail.currency : account.currency;
  const official = detail?.valuationBasis === 'official_api' || account.valuationBasis === 'official_api';
  const net = firstAmount(detail, ['total_assets', 'net_assets', 'netAssetValue']);
  const sourceTotal = firstAmount(detail, ['total']);
  const projection = state.portfolio?.accounts?.find((item: any) => item.accountId === accountId);
  const projected = !projection?.reconciliationRequired && projection?.currency === account.currency ? decimal(projection?.estimatedAmount) : null;
  const total = net ?? sourceTotal ?? projected ?? decimal(account.amount);
  const facts: AccountSummaryFact[] = total === null ? [] : [{ label: net !== null || official ? '净资产' : '账户总额', amount: total, currency: net !== null || sourceTotal !== null ? currency : account.currency }];
  const append = (label: string, fields: string[], factCurrency = currency) => {
    const amount = firstAmount(detail, fields);
    if (amount !== null) facts.push({ label, amount, currency: factCurrency });
  };
  append('证券市值', ['market_val', 'securities_market_value']);
  append('证券资产', ['securities_assets', 'securities_nav']);
  append('基金资产', ['funds_assets', 'fund_nav', 'fund_total']);
  append('现金', ['cash', 'cash_total']);
  if (!facts.some(fact => fact.label === '现金')) append('现金', ['cash_total_usd'], 'USD');
  append('购买力', ['power', 'buying_power', 'buyingPower']);
  return facts;
}

export function positionQuantityUnit(item: RecordValue): string {
  const explicit = item.quantityUnit ?? item.quantity_unit ?? item.unit ?? item.valuation?.quantityUnit;
  if (typeof explicit === 'string' && explicit.trim() && !/^[A-Z]{3}$/.test(explicit.trim()) && explicit.trim().length <= 12) {
    const unit = explicit.trim();
    return ({ g: '克', gram: '克', grams: '克', share: '股', shares: '股', unit: '份', units: '份' } as Record<string, string>)[unit.toLowerCase()] || unit;
  }
  return ({ gold: '克', stock: '股', fund: '份', etf: '份' } as Record<string, string>)[item.kind || item.valuation?.kind] || '';
}
