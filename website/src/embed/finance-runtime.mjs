import {analyzeFinanceJournal} from '../../../server/finance/analysis.mjs';
import {buildFinanceWeeklyReport} from '../../../server/finance/weekly-report.mjs';
import {fields} from '../../../server/finance/arithmetic.mjs';

/** The same pure arithmetic as the desktop, over an authored, immutable snapshot. */
export function financeExampleResponse(state,path,body,method) {
  if(method==='POST'&&path==='/journal/analysis'){
    fields(body,['month','currency']);
    return {analysis:analyzeFinanceJournal(state.journal,{today:state.example.asOf,month:body.month??state.analysis.month,currency:body.currency??state.valuation.currency,rates:state.valuation.rates})};
  }
  if(method==='POST'&&path==='/journal/weekly'){
    fields(body,['through','currency']);
    return {report:buildFinanceWeeklyReport(state.journal,{today:state.example.asOf,through:body.through??state.example.asOf,currency:body.currency??state.valuation.currency,rates:state.valuation.rates})};
  }
  return undefined;
}
