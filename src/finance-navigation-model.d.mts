export type FinanceSection = 'overview' | 'accounts' | 'holdings' | 'market' | 'liabilities' | 'transactions' | 'planning';
export const FINANCE_SECTIONS: readonly { id: FinanceSection; zh: string; en: string }[];
export const WORKSPACE_ORDER: readonly ('agents' | 'artifacts' | 'finance' | 'automations')[];
export function financeSection(value?: string): FinanceSection;
export function financeHref(section?: string): string;
export function financeFeatureDismissed(storage: Pick<Storage, 'getItem'>, key: string): boolean;
export function dismissFinanceFeature(storage: Pick<Storage, 'setItem'>, key: string): boolean;
