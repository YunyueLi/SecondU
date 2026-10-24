export const FINANCE_SECTIONS = Object.freeze([
  { id: 'overview', zh: '财务总览', en: 'Overview' },
  { id: 'accounts', zh: '我的账户', en: 'Accounts' },
  { id: 'holdings', zh: '投资持仓', en: 'Holdings' },
  { id: 'market', zh: '市场行情', en: 'Markets' },
  { id: 'liabilities', zh: '负债与还款', en: 'Liabilities' },
  { id: 'transactions', zh: '收支记录', en: 'Transactions' },
  { id: 'planning', zh: '财务规划', en: 'Planning' },
]);

export const WORKSPACE_ORDER = Object.freeze(['agents', 'artifacts', 'finance', 'automations']);

export function financeSection(value) {
  return FINANCE_SECTIONS.some(section => section.id === value) ? value : 'overview';
}

export function financeHref(section) {
  return `#finance/${financeSection(section)}`;
}

export function financeFeatureDismissed(storage, key) {
  try { return storage.getItem(key) === 'true'; }
  catch { return false; }
}

export function dismissFinanceFeature(storage, key) {
  try { storage.setItem(key, 'true'); return true; }
  catch { return false; }
}
