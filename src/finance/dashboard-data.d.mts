import type {FinanceState} from './types';
import type {FinanceJournalAnalysis} from '../../shared/finance-journal';
export function heldMarketRows(state:FinanceState):Array<{id:string;accountId:string;name:string;symbol:string;kind:string;quantity:string|null;marketValue:string|null;currency:string;price:string;changePct:string|null;asOf:string|null;sourceName:string|null;quoteStatus:string|null;linkedToAccount:boolean|null}>;
export function dashboardBudgets(analysis:FinanceJournalAnalysis|null|undefined,month:string):FinanceJournalAnalysis['budgets'];
