import type { FinanceState } from './types';
export function createFinanceContextSnapshot(state: FinanceState, options?: { section?: string; accountIds?: string[]; month?:string }): { name: string; content: string };
