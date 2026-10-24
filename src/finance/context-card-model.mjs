export const contextText=value=>typeof value==='string'?value:'';
export const contextRows=value=>Array.isArray(value)?value.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[];
export const contextAmount=value=>typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(value)?value:null;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
export function parseFinanceContext(content){
  const value=JSON.parse(content);
  if(!object(value)||!['secondu.finance-context.v1','secondu.finance-transactions.v1'].includes(value.schema))throw new Error('此附件不包含可预览的财务快照。');
  return value;
}
export function contextViews(snapshot){
  return [
    ...(object(snapshot.weeklyReport?.current)&&object(snapshot.weeklyReport?.previous)?[{value:'weekly',label:'周报'}]:[]),
    ...(object(snapshot.scenario?.assumptions)&&contextRows(snapshot.scenario?.points).length?[{value:'scenario',label:'情景测算'}]:[]),
    ...(contextRows(snapshot.accounts).length?[{value:'accounts',label:'账户'}]:[]),
    ...(contextRows(snapshot.analysis?.spending?.categories).length?[{value:'spending',label:'支出'}]:[]),
    ...(contextRows(snapshot.holdingValuations).length?[{value:'holdings',label:'持仓'}]:[]),
    ...(contextRows(snapshot.journal?.transactions||snapshot.transactions).length?[{value:'transactions',label:'交易'}]:[]),
  ];
}
export function initialContextView(snapshot){
  const views=contextViews(snapshot);
  return views.find(row=>['weekly','scenario'].includes(row.value))?.value||
    (snapshot.schema==='secondu.finance-transactions.v1'?'transactions':views.find(row=>row.value==='spending')?.value)||views[0]?.value||'';
}
export function contextAccountValues(row){
  const valuation=object(row.valuation),estimated=contextAmount(valuation?.estimatedAmount);
  return {
    recorded:{amount:contextAmount(row.amount),currency:contextText(row.currency),date:contextText(row.providerAsOf)||contextText(row.asOf)},
    estimated:estimated===null?null:{amount:estimated,currency:contextText(valuation?.currency)||contextText(row.currency),date:contextText(valuation?.asOf)},
    stale:row.readStatus==='stale'||valuation?.status==='stale',reconciliationRequired:valuation?.reconciliationRequired===true,
  };
}
export function contextScope(snapshot){
  return [
    ['账户',snapshot.accounts],['原始持仓',snapshot.recordedPositions],['持仓估值',snapshot.holdingValuations],
    ['行情',snapshot.quotes],['汇率',snapshot.rates],['交易',snapshot.journal?.transactions||snapshot.transactions],
    ['周期计划',snapshot.journal?.recurring],['信用记录',snapshot.journal?.creditRecords],['目标',snapshot.journal?.goals],
    ['预算',snapshot.journal?.budgets],['财务记忆',snapshot.journal?.memories],['净资产快照',snapshot.journal?.netWorthHistory],
  ].flatMap(([label,value])=>{const count=contextRows(value).length;return count?[{label,count}]:[];});
}
