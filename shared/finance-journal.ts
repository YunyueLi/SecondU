/** Local finance records. These contain user-supplied observations, never bank execution authority. */
export type FinanceJournalCollection = 'transactions' | 'recurring' | 'creditRecords' | 'goals' | 'budgets' | 'memories' | 'watchlist';
export type FinanceWidgetId = 'net-worth' | 'spend-by-category' | 'spend-this-month' | 'upcoming-payments' | 'subscriptions' | 'bills' | 'portfolio-distribution' | 'market-update' | 'credit-score' | 'transactions' | 'goals' | 'budgets' | 'memories';
export type FinanceUserRecordSource = { kind: 'manual' } | { kind: 'import'; fileName: string; fileHash: string; row: number; batchId: string };
export type FinanceConnectorRecordSource = { kind: 'connector'; provider: string; environment: 'production' | 'development'; transactionRef: string; accountRef: string; fetchedAt: string };
export type FinanceRecordSource = FinanceUserRecordSource | FinanceConnectorRecordSource;
export type FinanceJournalBase = { id: string; revision: number; archived: boolean; createdAt: string; updatedAt: string };
export type FinanceTransaction = FinanceJournalBase & {
  kind: 'expense' | 'income' | 'transfer'; occurredOn: string; amount: string; currency: string;
  merchant: string; category: string; subcategory: string; accountId: string | null; toAccountId: string | null;
  recurringId: string | null; recurringOccurrenceOn: string | null; note: string; source: FinanceRecordSource;
};
export type FinanceRecurring = FinanceJournalBase & {
  kind: 'bill' | 'subscription' | 'income'; name: string; amount: string; currency: string;
  anchorDate: string; endDate: string | null; frequency: 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'; interval: number;
  accountId: string | null; category: string; subcategory: string; note: string; source: FinanceUserRecordSource;
};
export type FinanceCreditRecord = FinanceJournalBase & {
  score: number; min: number; max: number; provider: string; model: string; asOf: string;
  factors: Array<{ name: string; value: string }>; note: string; source: FinanceUserRecordSource;
};
export type FinanceGoal = FinanceJournalBase & {
  name: string; targetAmount: string; currentAmount: string | null; currency: string; targetDate: string | null;
  description: string; source: FinanceUserRecordSource;
};
export type FinanceBudget = FinanceJournalBase & {
  name: string; month: string; amount: string; currency: string; category: string; subcategory: string;
  accountIds: string[]; source: FinanceUserRecordSource;
};
export type FinanceMemory = FinanceJournalBase & {
  text: string; kind: 'preference' | 'goal' | 'constraint' | 'note'; source: { kind: 'manual' };
};
export type FinanceWatchlistRecord = FinanceJournalBase & { symbol: string; exchange: 'US' | 'HK' | 'CN'; currency: string; kind: 'stock' | 'etf' | 'fund'; name: string; quoteId: string; source: { kind: 'manual' } };
export type FinanceJournalRecords = { transactions: FinanceTransaction; recurring: FinanceRecurring; creditRecords: FinanceCreditRecord; goals: FinanceGoal; budgets: FinanceBudget; memories: FinanceMemory; watchlist: FinanceWatchlistRecord };
/** Create with id omitted/null and expectedRevision 0. Update submits the full editable record. */
export type FinanceRecordInput<C extends FinanceJournalCollection> = Partial<Omit<FinanceJournalRecords[C], keyof FinanceJournalBase | 'quoteId' | 'source'>> & {
  id?: string | null; expectedRevision: number; idempotencyKey: string; source?: FinanceUserRecordSource;
};
export type FinanceTransactionsImportInput = { idempotencyKey: string; transactions: FinanceRecordInput<'transactions'>[] };
export type FinanceArchiveInput = { id: string; expectedRevision: number; idempotencyKey: string; archived: boolean };
export type FinanceDashboard = { revision: number; enabled: FinanceWidgetId[]; order: FinanceWidgetId[]; updatedAt: string | null };
export type FinanceDashboardInput = Omit<FinanceDashboard, 'revision' | 'updatedAt'> & { expectedRevision: number; idempotencyKey: string };
export type FinanceSnapshot = FinanceJournalBase & {
  capturedAt: string; date: string; timeZone: 'Asia/Shanghai'; currency: string; sourceRevision: string;
  basis: 'recorded_balances_at_capture_fx';
  accounts: Array<{ id: string; name: string; kind: 'asset' | 'liability'; currency: string; amount: string; asOf: string }>;
  scope: { accountIds: string[]; liabilityIds: string[]; archivedAccountIds: string[] };
  valuation: { assets: string | null; liabilities: string | null; net: string | null; complete: boolean; unconvertedCurrencies: string[]; rates: FinanceJournalRate[] };
};
export type FinanceJournalRate = { currency: string; rate: string; baseCurrency?: string; asOf?: string | null; sourceName?: string; sourceUrl?: string | null; status?: string };
export type FinanceJournalDocument = {
  version: 1; revision: string; transactions: FinanceTransaction[]; recurring: FinanceRecurring[]; creditRecords: FinanceCreditRecord[];
  goals: FinanceGoal[]; budgets: FinanceBudget[]; memories: FinanceMemory[]; watchlist: FinanceWatchlistRecord[]; snapshots: FinanceSnapshot[]; dashboard: FinanceDashboard;
};
/** complete describes conversion coverage only; all amounts cover recorded transactions, not all real-world spending. */
export type FinanceRecordedTotal = { basis: 'original_amounts_current_fx'; rates: FinanceJournalRate[]; amount: string | null; currency: string; byCurrency: Record<string, string>; recordCount: number; complete: boolean; missingCurrencies: string[] };
export type FinanceRecurringTotals = { basis: 'scheduled_cadence_equivalent'; activeCount: number; byCurrency: Array<{ currency: string; monthly: string; annual: string; recordCount: number }>; excludedOnceCount: number };
export type FinanceJournalAnalysis = {
  month: string; currency: string; today: string;
  coverage: { status: 'empty' | 'recorded_only'; transactionCount: number; expenseCount: number; incomeCount: number; transferCount: number; recordedMonths: string[] };
  spending: {
    expenses: FinanceRecordedTotal; income: FinanceRecordedTotal; netCashFlow: FinanceRecordedTotal;
    categories: Array<{ category: string; total: FinanceRecordedTotal; subcategories: Array<{ subcategory: string; total: FinanceRecordedTotal }> }>;
    daily: Array<{ date: string; cumulative: FinanceRecordedTotal; previousAverage: string | null; comparisonMonths: string[] }>;
    comparisonMonths: string[];
  };
  monthlyTrend: Array<{ month: string; expenses: FinanceRecordedTotal; income: FinanceRecordedTotal; netCashFlow: FinanceRecordedTotal }>;
  upcoming: Array<{ recurringId: string; occurrenceDate: string; name: string; kind: FinanceRecurring['kind']; amount: string; currency: string; accountId: string | null; paidAmount: string | null; remainingAmount: string }>;
  recurringSummary: Array<{ recurringId: string; nextOccurrenceDate: string | null; monthlyEquivalent: string | null; annualEquivalent: string | null }>;
  subscriptions: FinanceRecurringTotals;
  bills: FinanceRecurringTotals;
  feesInterest: { fees: FinanceRecordedTotal; interest: FinanceRecordedTotal; interestIncome: FinanceRecordedTotal };
  credit: { latest: FinanceCreditRecord | null; history: FinanceCreditRecord[]; series: Array<{ provider: string; model: string; min: number; max: number; records: FinanceCreditRecord[] }> };
  netWorth: { currency: string; history: FinanceSnapshot[]; latest: FinanceSnapshot | null; series: Array<{ currency: string; history: FinanceSnapshot[] }> };
  goals: Array<FinanceGoal & { progressPercent: number | null; remainingAmount: string | null }>;
  budgets: Array<FinanceBudget & { spent: FinanceRecordedTotal; remainingAmount: string | null; progressPercent: number | null }>;
  memories: FinanceMemory[];
};

export type FinanceWeeklyChange = { amount: string | null; currency: string; byCurrency: Record<string, string | null>; complete: boolean };
export type FinanceWeeklyPeriod = {
  from: string; through: string; expenses: FinanceRecordedTotal; income: FinanceRecordedTotal; netCashFlow: FinanceRecordedTotal;
  recordIds: string[]; transactionCount: number;
};
/** Deterministic local readout. Snapshot and credit comparisons retain their actual dates and may span more than a week. */
export type FinanceWeeklyReport = {
  version: 1; basis: 'recorded_records_only'; currency: string; today: string; through: string;
  current: FinanceWeeklyPeriod; previous: FinanceWeeklyPeriod;
  change: { expenses: FinanceWeeklyChange; income: FinanceWeeklyChange; netCashFlow: FinanceWeeklyChange };
  categories: Array<{ category: string; current: FinanceRecordedTotal; previous: FinanceRecordedTotal; change: FinanceWeeklyChange; recordIds: string[] }>;
  upcoming: { from: string; through: string; items: Array<FinanceJournalAnalysis['upcoming'][number] & { paymentRecordIds: string[] }> };
  netWorth: { latest: FinanceSnapshot | null; previous: FinanceSnapshot | null; change: string | null; currency: string; reason: null | 'missing_snapshot' | 'missing_comparable_snapshot' | 'incomplete_valuation' };
  credit: { latest: FinanceCreditRecord | null; previous: FinanceCreditRecord | null; change: number | null; reason: null | 'missing_record' | 'missing_comparable_record' };
  sources: { journalRevision: string | null; transactionIds: string[]; recurringIds: string[]; snapshotIds: string[]; creditRecordIds: string[]; recordIds: string[] };
  coverage: { status: 'empty' | 'recorded_only'; currentTransactionCount: number; previousTransactionCount: number; missingCurrencies: string[] };
};
