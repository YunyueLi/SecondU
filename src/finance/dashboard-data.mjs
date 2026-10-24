/** A dashboard market row belongs to an actual, current holding, never to a watchlist alone. */
export function heldMarketRows(state){
  const accounts=new Set((state.accounts||[]).map(row=>row.id));
  return (state.portfolio?.holdings||[]).filter(row=>accounts.has(row.accountId)&&row.positionCurrent!==false&&['stock','etf','fund'].includes(row.kind)).flatMap(row=>{
    const code=row.valuationCurrency||row.recordedCurrency||row.currency;
    const usable=quote=>quote&&quote.currency===code&&quote.price!=null&&!['unmapped','unavailable'].includes(quote.status);
    const quote=usable(row.quote)?row.quote:(state.market?.quotes||[]).find(item=>usable(item)&&(item.positionIds?.includes(row.id)||item.symbol===row.symbol));
    if(!quote)return [];
    return [{id:row.id,accountId:row.accountId,name:row.name||row.symbol,symbol:row.symbol,kind:row.kind,quantity:row.quantity??null,marketValue:row.marketValue??row.currentMarketValue??row.estimatedMarketValue??null,currency:code,price:quote.price,changePct:quote.changePct??null,asOf:quote.asOf??null,sourceName:quote.sourceName??null,quoteStatus:quote.status??null,linkedToAccount:row.linkedToAccount??null}];
  });
}
export function dashboardBudgets(analysis,month){return (analysis?.budgets||[]).filter(row=>row.month===month);}
