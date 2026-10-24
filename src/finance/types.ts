import type {FinanceJournalDocument,FinanceJournalAnalysis} from '../../shared/finance-journal';
export type FinanceAccount = {
  id: string;
  name: string;
  kind: 'asset' | 'liability';
  amount: string;
  currency: string;
  asOf: string;
  description?: string;
  provider?: string;
  institution?: string | { id?: string; name?: string };
  suffix?: string;
  readOnly?: boolean;
  canAddPosition?: boolean;
  detailCurrent?: boolean;
  detailAsOf?: string;
  source_refs?: string[];
  [key: string]: any;
};

export type FinanceState = {
  journal?: FinanceJournalDocument;
  analysis?: FinanceJournalAnalysis;
  revision: string | number;
  observedAt?: string;
  accounts: FinanceAccount[];
  liabilities: FinanceAccount[];
  totals: { assetsByCurrency: Record<string, string>; liabilitiesByCurrency: Record<string, string> };
  valuation: {
    currency?: string;
    baseCurrency?: string;
    assets: string | null;
    liabilities: string | null;
    net: string | null;
    complete: boolean;
    asOf?: string | null;
    rates: Array<{ currency: string; rate: string; baseCurrency?: string; asOf?: string | null; sourceName?: string; sourceUrl?: string | null; status?: string }>;
    convertedAccounts: Array<{ accountId: string; kind: string; amount: string | null }>;
    issue?: { message: string } | null;
    unconvertedCurrencies?: string[];
  };
  metadata?: {
    onboarding?: { completed: boolean; displayCurrency: string; method?: 'manual' | 'connector' | 'later' };
    [key: string]: any;
  };
  positions?: { revision?: number | string; items?: any[] };
  portfolio?: any;
  market?: any;
  officialObservations?: any;
  officialObservationIssue?: { message: string } | null;
  snapshot?: any;
  updates?: any[];
  [key: string]: any;
};

export type FinanceSection = 'overview' | 'accounts' | 'holdings' | 'market' | 'liabilities' | 'transactions' | 'planning';
export type OnboardingPreferences = { completed: boolean; displayCurrency: string; method?: 'manual' | 'connector' | 'later' };
