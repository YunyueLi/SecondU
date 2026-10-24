import {currency as validCurrency,fail,fixed,minor} from './arithmetic.mjs';
import {analyzeFinanceJournal,recordedTotal} from './analysis.mjs';
import {journalDay,journalToday} from './journal.mjs';
import {addDays,recurringOccurrences} from './recurrence.mjs';

const active=(doc,key)=>(doc[key]??[]).filter(row=>!row.archived);
const unique=values=>[...new Set(values)].sort();
const ids=rows=>unique(rows.map(row=>row.id));
const between=(rows,from,through)=>rows.filter(row=>row.occurredOn>=from&&row.occurredOn<=through);
function period(rows,from,through,currency,rates){
  const expenses=rows.filter(row=>row.kind==='expense'),income=rows.filter(row=>row.kind==='income');
  const flows=rows.filter(row=>row.kind!=='transfer').map(row=>({...row,amount:row.kind==='expense'?fixed(-minor(row.amount)):row.amount}));
  return {from,through,expenses:recordedTotal(expenses,currency,rates),income:recordedTotal(income,currency,rates),netCashFlow:recordedTotal(flows,currency,rates),recordIds:ids(rows),transactionCount:rows.length};
}
function difference(current,previous){
  const amount=current.amount!==null&&previous.amount!==null?fixed(minor(current.amount)-minor(previous.amount)):null;
  const byCurrency=Object.fromEntries(unique([...Object.keys(current.byCurrency),...Object.keys(previous.byCurrency)]).map(code=>[code,current.byCurrency[code]!==undefined&&previous.byCurrency[code]!==undefined?fixed(minor(current.byCurrency[code])-minor(previous.byCurrency[code])):null]));
  return {amount,currency:current.currency,byCurrency,complete:amount!==null&&current.complete&&previous.complete};
}
function snapshotScope(row){
  // Both contributing sides, archived exclusions and original currency identities must match.
  return JSON.stringify({accounts:unique(row.scope?.accountIds??[]),liabilities:unique(row.scope?.liabilityIds??[]),archived:unique(row.scope?.archivedAccountIds??[]),currencies:(row.accounts??[]).map(item=>[item.id,item.kind,item.currency]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});
}
function netWorthComparison(doc,through,currency){
  const eligible=active(doc,'snapshots').filter(row=>row.date<=through&&row.currency===currency).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||a.id.localeCompare(b.id));
  const latest=eligible.at(-1)??null;
  if(!latest)return {latest:null,previous:null,change:null,currency,reason:'missing_snapshot'};
  const previous=eligible.slice(0,-1).reverse().find(row=>snapshotScope(row)===snapshotScope(latest))??null;
  if(!previous)return {latest,previous:null,change:null,currency,reason:'missing_comparable_snapshot'};
  if(latest.valuation.net===null||previous.valuation.net===null||!latest.valuation.complete||!previous.valuation.complete)return {latest,previous,change:null,currency,reason:'incomplete_valuation'};
  return {latest,previous,change:fixed(minor(latest.valuation.net)-minor(previous.valuation.net)),currency,reason:null};
}
function creditComparison(doc,through){
  const eligible=active(doc,'creditRecords').filter(row=>row.asOf<=through).sort((a,b)=>a.asOf.localeCompare(b.asOf)||a.updatedAt.localeCompare(b.updatedAt)||a.id.localeCompare(b.id));
  const latest=eligible.at(-1)??null;
  if(!latest)return {latest:null,previous:null,change:null,reason:'missing_record'};
  const previous=eligible.slice(0,-1).reverse().find(row=>row.provider===latest.provider&&row.model===latest.model&&row.min===latest.min&&row.max===latest.max)??null;
  return {latest,previous,change:previous?latest.score-previous.score:null,reason:previous?null:'missing_comparable_record'};
}

/** Builds a read-only report from current saved observations; it does not reconstruct historical revisions or modify the journal. */
export function buildFinanceWeeklyReport(doc,{through,currency='CNY',rates=[],today=journalToday()}={}){
  journalDay(today);through=journalDay(through??today,{future:false,today});validCurrency(currency);
  const from=addDays(through,-6),previousThrough=addDays(through,-7),previousFrom=addDays(through,-13),upcomingFrom=addDays(through,1),upcomingThrough=addDays(through,7);
  if(!from||!previousThrough||!previousFrom||!upcomingFrom||!upcomingThrough)fail('周报日期超出支持范围。','finance_invalid_date');
  const transactions=active(doc,'transactions').filter(row=>row.occurredOn<=through);
  const currentRows=between(transactions,from,through),previousRows=between(transactions,previousFrom,previousThrough);
  const current=period(currentRows,from,through,currency,rates),previous=period(previousRows,previousFrom,previousThrough,currency,rates);
  const change=Object.fromEntries(['expenses','income','netCashFlow'].map(key=>[key,difference(current[key],previous[key])]));
  const expenseRows=[...currentRows,...previousRows].filter(row=>row.kind==='expense');
  const categories=unique(expenseRows.map(row=>row.category)).map(category=>{
    const rows=expenseRows.filter(row=>row.category===category),current=recordedTotal(between(rows,from,through),currency,rates),previous=recordedTotal(between(rows,previousFrom,previousThrough),currency,rates);
    return {category,current,previous,change:difference(current,previous),recordIds:ids(rows)};
  });
  const projected=analyzeFinanceJournal({...doc,transactions},{today:upcomingFrom,month:through.slice(0,7),currency,rates});
  const items=projected.upcoming.filter(row=>row.occurrenceDate<=upcomingThrough).map(row=>({...row,paymentRecordIds:ids(transactions.filter(item=>item.recurringId===row.recurringId&&item.recurringOccurrenceOn===row.occurrenceDate&&item.currency===row.currency&&item.kind===(row.kind==='income'?'income':'expense')))}));
  const scheduled=active(doc,'recurring').filter(row=>recurringOccurrences(row,upcomingFrom,upcomingThrough).length);
  const paymentEvidence=transactions.filter(item=>scheduled.some(row=>item.recurringId===row.id&&item.recurringOccurrenceOn>=upcomingFrom&&item.recurringOccurrenceOn<=upcomingThrough&&item.currency===row.currency&&item.kind===(row.kind==='income'?'income':'expense')));
  const netWorth=netWorthComparison(doc,through,currency),credit=creditComparison(doc,through);
  const transactionIds=unique([...current.recordIds,...previous.recordIds,...ids(paymentEvidence)]),recurringIds=ids(scheduled),snapshotIds=ids([netWorth.latest,netWorth.previous].filter(Boolean)),creditRecordIds=ids([credit.latest,credit.previous].filter(Boolean));
  const missingCurrencies=unique([current,previous].flatMap(period=>['expenses','income','netCashFlow'].flatMap(key=>period[key].missingCurrencies)));
  return {version:1,basis:'recorded_records_only',currency,today,through,current,previous,change,categories,upcoming:{from:upcomingFrom,through:upcomingThrough,items},netWorth,credit,sources:{journalRevision:doc.revision??null,transactionIds,recurringIds,snapshotIds,creditRecordIds,recordIds:unique([...transactionIds,...recurringIds,...snapshotIds,...creditRecordIds])},coverage:{status:currentRows.length?'recorded_only':'empty',currentTransactionCount:currentRows.length,previousTransactionCount:previousRows.length,missingCurrencies}};
}
