import {currency as validCurrency,fixed,fraction,minor,sum,valuation} from './arithmetic.mjs';
import {journalDay,journalMonth,journalToday} from './journal.mjs';
import {addDays,monthAt,daysInMonth,occurrenceAt,firstIndex,recurringOccurrences} from './recurrence.mjs';
export {recurringOccurrences} from './recurrence.mjs';

function paymentFor(row,date,transactions){
  const payments=transactions.filter(item=>item.recurringId===row.id&&item.recurringOccurrenceOn===date&&item.kind===(row.kind==='income'?'income':'expense')&&item.currency===row.currency);
  const paid=payments.length?sum(payments.map(item=>item.amount)):null;
  const due=minor(row.amount),net=paid===null?0n:minor(paid),remaining=due-(net>0n?net:0n);
  return {paidAmount:paid,remainingAmount:fixed(remaining>0n?remaining:0n),settled:payments.length>0&&net>=due};
}
function nextOccurrence(row,today,transactions){
  // There can be no more settled future occurrences than there are saved payments.
  for(let index=firstIndex(row,today),checked=0;checked<=transactions.length+2;index++,checked++){
    const date=occurrenceAt(row,index);
    if(!date||row.endDate&&date>row.endDate)return null;
    if(date>=today&&!paymentFor(row,date,transactions).settled)return date;
  }
  return null;
}
function nativeTotals(rows){
  const grouped=new Map();for(const row of rows){const values=grouped.get(row.currency)??[];values.push(row.amount);grouped.set(row.currency,values);}
  return Object.fromEntries([...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([code,values])=>[code,sum(values)]));
}
export function recordedTotal(rows,currency,rates=[]){
  const byCurrency=nativeTotals(rows),result=valuation(rows.map((row,index)=>({id:String(index),currency:row.currency,amount:row.amount})),[],currency,rates);
  return {basis:'original_amounts_current_fx',rates:result.rates,amount:rows.length?result.assets:null,currency,byCurrency,recordCount:rows.length,complete:rows.length>0&&result.complete,missingCurrencies:result.unconvertedCurrencies};
}
const cashFlow=rows=>rows.filter(row=>row.kind!=='transfer').map(row=>({...row,amount:row.kind==='expense'?fixed(-minor(row.amount)):row.amount}));
function monthTotals(rows,code,rates){return {expenses:recordedTotal(rows.filter(row=>row.kind==='expense'),code,rates),income:recordedTotal(rows.filter(row=>row.kind==='income'),code,rates),netCashFlow:recordedTotal(cashFlow(rows),code,rates)};}
function ratio(n,d){return Number((n*10000n)/d)/100;}
function equivalent(row){
  const periods={weekly:52n,monthly:12n,quarterly:4n,yearly:1n}[row.frequency];
  if(!periods)return null;
  const amount=fraction(row.amount);return {n:amount.n*periods,d:amount.d*BigInt(row.interval??1)};
}
function addFraction(left,right){const n=left.n*right.d+right.n*left.d,d=left.d*right.d;let a=n<0n?-n:n,b=d;while(b){[a,b]=[b,a%b];}return {n:n/a,d:d/a};}
function recurringTotals(rows,kind,today){
  const active=rows.filter(row=>row.kind===kind&&row.anchorDate<=today&&(!row.endDate||row.endDate>=today));
  const currencies=new Map();let excludedOnceCount=0;
  for(const row of active){const annual=equivalent(row);if(!annual){excludedOnceCount++;continue;}const entry=currencies.get(row.currency)??{total:{n:0n,d:1n},count:0};entry.total=addFraction(entry.total,annual);entry.count++;currencies.set(row.currency,entry);}
  return {basis:'scheduled_cadence_equivalent',activeCount:active.length,byCurrency:[...currencies].sort(([a],[b])=>a.localeCompare(b)).map(([currency,{total,count}])=>({currency,monthly:fixed(total.n,total.d*12n),annual:fixed(total.n,total.d),recordCount:count})),excludedOnceCount};
}
const active=(doc,key)=>(doc[key]??[]).filter(row=>!row.archived);

/** Pure projections of saved observations. Missing records and missing FX remain unknown. */
export function analyzeFinanceJournal(doc,{month=journalToday().slice(0,7),currency='CNY',rates=[],today=journalToday()}={}){
  journalMonth(month);journalDay(today);validCurrency(currency);
  const transactions=active(doc,'transactions'),recurring=active(doc,'recurring');
  const selected=transactions.filter(row=>row.occurredOn.startsWith(month)),expenses=selected.filter(row=>row.kind==='expense');
  const grouped=new Map();for(const row of expenses){const group=grouped.get(row.category)??[];group.push(row);grouped.set(row.category,group);}
  const categories=[...grouped].map(([category,rows])=>{
    const subs=[...new Set(rows.map(row=>row.subcategory))].sort();
    return {category,total:recordedTotal(rows,currency,rates),subcategories:subs.map(subcategory=>({subcategory,total:recordedTotal(rows.filter(row=>row.subcategory===subcategory),currency,rates)}))};
  }).sort((a,b)=>a.category.localeCompare(b.category));
  const comparisonMonths=[1,2,3].map(offset=>monthAt(month,-offset)).filter(previous=>transactions.some(row=>row.kind==='expense'&&row.occurredOn.startsWith(previous)));
  const days=month>today.slice(0,7)?0:month===today.slice(0,7)?Number(today.slice(8)):daysInMonth(month);
  const daily=expenses.length?Array.from({length:days},(_,i)=>{
    const date=`${month}-${String(i+1).padStart(2,'0')}`,current=expenses.filter(row=>row.occurredOn<=date);
    const previous=comparisonMonths.map(previousMonth=>{
      const end=`${previousMonth}-${String(Math.min(i+1,daysInMonth(previousMonth))).padStart(2,'0')}`;
      const rows=transactions.filter(row=>row.kind==='expense'&&row.occurredOn.startsWith(previousMonth)&&row.occurredOn<=end);
      return {month:previousMonth,total:recordedTotal(rows,currency,rates)};
    }).filter(item=>item.total.recordCount>0);
    const previousAverage=previous.length&&previous.every(item=>item.total.complete)?fixed(previous.reduce((n,item)=>n+minor(item.total.amount),0n),BigInt(previous.length)*100n):null;
    return {date,cumulative:recordedTotal(current,currency,rates),previousAverage,comparisonMonths:previous.map(item=>item.month)};
  }):[];
  const recordedMonths=[...new Set(transactions.map(row=>row.occurredOn.slice(0,7)))].sort();
  const trendMonths=Array.from({length:12},(_,i)=>monthAt(month,i-11)).filter(value=>recordedMonths.length&&value>=recordedMonths[0]);
  const monthlyTrend=trendMonths.map(month=>({month,...monthTotals(transactions.filter(row=>row.occurredOn.startsWith(month)),currency,rates)}));
  const through=addDays(today,29)??'9999-12-31';
  const upcoming=recurring.flatMap(row=>recurringOccurrences(row,today,through).flatMap(occurrenceDate=>{
    const payment=paymentFor(row,occurrenceDate,transactions);
    return payment.settled?[]:[{recurringId:row.id,occurrenceDate,name:row.name,kind:row.kind,amount:row.amount,currency:row.currency,accountId:row.accountId,paidAmount:payment.paidAmount,remainingAmount:payment.remainingAmount}];
  })).sort((a,b)=>a.occurrenceDate.localeCompare(b.occurrenceDate)||a.recurringId.localeCompare(b.recurringId));
  const recurringSummary=recurring.map(row=>{const annual=equivalent(row);return {recurringId:row.id,nextOccurrenceDate:nextOccurrence(row,today,transactions),monthlyEquivalent:annual?fixed(annual.n,annual.d*12n):null,annualEquivalent:annual?fixed(annual.n,annual.d):null};});
  const creditHistory=active(doc,'creditRecords').sort((a,b)=>a.asOf.localeCompare(b.asOf)||a.updatedAt.localeCompare(b.updatedAt)||a.id.localeCompare(b.id));
  const creditGroups=new Map();for(const row of creditHistory){const key=JSON.stringify([row.provider,row.model,row.min,row.max]),group=creditGroups.get(key)??{provider:row.provider,model:row.model,min:row.min,max:row.max,records:[]};group.records.push(row);creditGroups.set(key,group);}
  const snapshotGroups=new Map();
  for(const row of active(doc,'snapshots').sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||a.id.localeCompare(b.id))){const byDay=snapshotGroups.get(row.currency)??new Map();byDay.set(row.date,row);snapshotGroups.set(row.currency,byDay);}
  const snapshotSeries=[...snapshotGroups].map(([currency,byDay])=>({currency,history:[...byDay.values()]}));
  const history=snapshotSeries.find(row=>row.currency===currency)?.history??[];
  const goals=active(doc,'goals').map(row=>({ ...row,progressPercent:row.currentAmount===null?null:ratio(minor(row.currentAmount),minor(row.targetAmount)),remainingAmount:row.currentAmount===null?null:fixed(minor(row.targetAmount)>minor(row.currentAmount)?minor(row.targetAmount)-minor(row.currentAmount):0n) }));
  const budgets=active(doc,'budgets').map(row=>{
    const matching=transactions.filter(item=>item.kind==='expense'&&item.occurredOn.startsWith(row.month)&&(!row.category||item.category===row.category)&&(!row.subcategory||item.subcategory===row.subcategory)&&(!row.accountIds.length||row.accountIds.includes(item.accountId)));
    const spent=recordedTotal(matching,row.currency,rates),known=spent.amount!==null;
    return {...row,spent,remainingAmount:known?fixed(minor(row.amount)-minor(spent.amount)):null,progressPercent:known&&minor(row.amount)>0n?ratio(minor(spent.amount),minor(row.amount)):null};
  });
  return {month,currency,today,coverage:{status:selected.length?'recorded_only':'empty',transactionCount:selected.length,expenseCount:expenses.length,incomeCount:selected.filter(row=>row.kind==='income').length,transferCount:selected.filter(row=>row.kind==='transfer').length,recordedMonths},spending:{...monthTotals(selected,currency,rates),categories,daily,comparisonMonths},monthlyTrend,upcoming,recurringSummary,subscriptions:recurringTotals(recurring,'subscription',today),bills:recurringTotals(recurring,'bill',today),feesInterest:{fees:recordedTotal(expenses.filter(row=>row.category==='fees'),currency,rates),interest:recordedTotal(expenses.filter(row=>row.category==='interest'),currency,rates),interestIncome:recordedTotal(selected.filter(row=>row.kind==='income'&&row.category==='interest'),currency,rates)},credit:{latest:creditHistory.at(-1)??null,history:creditHistory,series:[...creditGroups.values()]},netWorth:{currency,history,latest:history.at(-1)??null,series:snapshotSeries},goals,budgets,memories:active(doc,'memories')};
}
