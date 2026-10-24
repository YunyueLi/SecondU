import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exportCanonicalExamples} from './export-examples.mjs';
import {ExampleRuntime} from './src/embed/memory-runtime.mjs';
import {financeExampleResponse} from './src/embed/finance-runtime.mjs';
import {portableFinanceDates} from './browser-finance.mjs';
import {assetAllocationFor} from '../src/finance/asset-allocation.ts';
import {accountBrand,summaryFor} from '../src/finance/model.ts';
import {heldMarketRows} from '../src/finance/dashboard-data.mjs';
import {FINANCE_WIDGET_IDS} from '../server/finance/journal.mjs';
import {analyzeFinanceJournal} from '../server/finance/analysis.mjs';
import {buildFinanceWeeklyReport} from '../server/finance/weekly-report.mjs';
import {fixed,fraction,minor,multiply,sum} from '../server/finance/arithmetic.mjs';

let examples;
test.before(async()=>{examples=await exportCanonicalExamples();});
test('public Finance fixture has coherent fictional records and never claims a provider connection',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'];
    assert.equal(state.example.fictional,true);assert.equal(state.example.asOf,'2026-10-25');
    assert.equal(state.example.persona,'Alex Morgan');assert.equal(state.example.profile.country,'US');assert.equal(state.example.profile.city,'San Mateo');
    assert.equal(state.example.profile.employer,'Aster Vale AI');assert.equal(state.valuation.currency,'USD');assert.equal(state.analysis.currency,'USD');
    assert.equal(state.example.profile.unvestedEquityIncluded,false);assert.equal(state.example.profile.unexercisedOptionsIncluded,false);
    assert.equal(state.example.profile.timeZone,'America/Los_Angeles');assert.equal(state.market.timeZone,'America/Los_Angeles');
    assert.equal(state.example.profile.region,'San Francisco Bay Area');assert.equal(state.example.profile.housing,'renting');assert.equal(state.example.profile.employerFictional,true);
    assert.equal(state.accounts.length,11);assert.equal(state.liabilities.length,3);
    assert.equal(state.positions.items.length,19);assert.equal(state.journal.transactions.length,119);
    assert.equal(state.connection.bankConnected,false);assert.equal(state.analysis.month,'2026-10');
    assert.equal(state.valuation.complete,true);assert.equal(state.portfolio.summary.complete,true);
    assert.ok([...state.accounts,...state.liabilities].every(row=>row.provider==='manual'&&!row.readOnly&&row.observationType==='manual'&&row.asOf==='2026-10-25'));
    assert.ok(state.market.quotes.every(row=>row.status==='example'&&row.marketState==='FICTIONAL_SNAPSHOT'&&/虚构|fictional/.test(row.sourceName)&&row.sourceUrl===null));
    assert.ok(state.market.rates.every(row=>row.sourceUrl===null&&(row.currency==='CNY'?row.rate==='1':row.status==='example')));
    assert.deepEqual([...new Set(state.accounts.map(row=>row.currency))].sort(),['EUR','GBP','USD']);
    assert.deepEqual([...new Set(state.accounts.map(row=>accountBrand(row)))].sort(),['ally','chase','fidelity','ibkr','personal-assets','schwab']);
    assert.ok(state.accounts.every(row=>row.institution?.name&&row.sourceName));
    assert.ok([...state.accounts,...state.liabilities,...state.positions.items,...state.journal.goals,...state.journal.recurring].every(row=>!/[（(](?:示例|虚构|example|fictional)[）)]|账本|·/i.test(row.name)));
    for(const route of ['/finance/connections/moomoo/status','/finance/connections/moomoo/appkey/status']){
      const status=example.responses[route];assert.equal(status.connected,false);assert.equal(status.canSync,false);assert.equal(status.reason,'showcase');
    }
    for(const provider of example.responses['/finance/connections'].providers){
      const status=example.responses[`/finance/connections/${provider.provider}/status`];
      assert.equal(status.connected,false);assert.equal(status.available,false);assert.notEqual(status.authorized,true);
    }
  }
});

test('asset views reconcile all currencies and never count securities or account cash twice',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'];
    for(const code of ['USD','EUR','GBP']){
      const allocation=assetAllocationFor(state,code),summary=summaryFor(state,code);
      assert.equal(summary.complete,true);assert.deepEqual(allocation.issues,[]);
      assert.equal(allocation.total,summary.assets);assert.equal(sum(allocation.groups.map(row=>row.amount)),summary.assets);
      assert.equal(fixed(minor(summary.assets)-minor(summary.liabilities)),summary.net);
      assert.ok(!allocation.groups.some(row=>['investment','unclassified','valuation_adjustment'].includes(row.type)));
      assert.ok(summaryFor(state,code,code).accounts.length>0);
    }
    for(const account of state.accounts.filter(row=>row.assetType==='investment')){
      const positions=state.positions.items.filter(row=>row.accountId===account.id),projection=state.portfolio.accounts.find(row=>row.accountId===account.id);
      assert.equal(sum(positions.map(row=>row.recordedMarketValue)),account.amount,account.name);
      assert.equal(projection.bookResidual,'0.00');assert.equal(projection.reconciliationRequired,false);
      assert.equal(projection.coveredCount,positions.length);
      for(const position of positions){const quote=state.market.quotes.find(row=>row.positionIds.includes(position.id));assert.equal(multiply(position.quantity,quote.price),position.recordedMarketValue);}
    }
    assert.deepEqual(state.positions.items.filter(row=>row.kind==='cash').map(row=>[row.currency,row.recordedMarketValue]).sort(),[['USD','1750.00'],['USD','28610.00'],['USD','360.00'],['USD','3788.00'],['USD','750.00'],['USD','9000.00']]);
    assert.ok(!state.accounts.some(row=>row.assetType==='real_estate'));assert.ok(!state.liabilities.some(row=>row.liabilityType==='mortgage'));
    const car=state.accounts.find(row=>row.assetType==='vehicle');assert.equal(car.amount,'28500.00');assert.equal(car.assetDetails.ownershipPercent,'100');
    assert.equal(state.liabilities.find(row=>row.id===car.assetDetails.linkedLiabilityIds[0]).amount,'12600.00');
    for(const key of ['taxable','401k','roth-ira','hsa','vested-stock','espp'])assert.equal(state.accounts.find(row=>row.id.endsWith(`-${key}`)).assetType,'investment');
    assert.ok([...state.accounts,...state.liabilities,...state.positions.items].every(row=>row.currency!=='CNY'&&row.currency!=='CNH'));
    assert.ok(state.accounts.every(row=>!/unvested|未归属/i.test(row.name)));
    assert.ok(state.journal.transactions.every(row=>!/unvested|未归属/i.test(row.merchant)));
    assert.ok(state.journal.transactions.filter(row=>row.kind==='income').every(row=>!/RSU/i.test(row.merchant)));
  }
  const zh=examples.zh.responses['/finance/state'],en=examples.en.responses['/finance/state'];
  assert.deepEqual([zh.valuation.assets,zh.valuation.liabilities,zh.valuation.net],['729096.75','16480.75','712616.00']);
  assert.deepEqual([en.valuation.assets,en.valuation.liabilities,en.valuation.net],['729096.75','16480.75','712616.00']);
});

test('Chinese and English fixtures contain the same financial history, not different portfolios',()=>{
  const zh=examples.zh.responses['/finance/state'],en=examples.en.responses['/finance/state'];
  const accounts=state=>[...state.accounts,...state.liabilities].map(row=>[row.id,row.kind,row.assetType||row.liabilityType,row.amount,row.currency,row.asOf,row.institution.id]).sort();
  const positions=state=>state.positions.items.map(row=>[row.accountId,row.symbol,row.kind,row.quantity,row.costPrice,row.recordedMarketValue,row.currency]).sort();
  const transactions=state=>state.journal.transactions.map(row=>[row.occurredOn,row.kind,row.amount,row.currency,row.accountId,row.toAccountId,row.category]).sort();
  assert.deepEqual(accounts(zh),accounts(en));assert.deepEqual(positions(zh),positions(en));assert.deepEqual(transactions(zh),transactions(en));
  assert.deepEqual(zh.example.reconciliation,en.example.reconciliation);
  assert.equal(zh.valuation.currency,'USD');assert.equal(en.valuation.currency,'USD');
  assert.equal(zh.valuation.net,en.valuation.net);assert.equal(zh.example.persona,en.example.persona);
  assert.deepEqual(zh.example.payroll,en.example.payroll);assert.deepEqual(zh.example.equitySales,en.example.equitySales);
  const englishCopy=[...en.accounts,...en.liabilities,...en.positions.items,...en.journal.transactions,...en.journal.goals,...en.journal.budgets,...en.journal.recurring,...en.journal.memories,...en.journal.creditRecords];
  for(const row of englishCopy)for(const field of ['name','description','note','merchant','text'])if(row[field])assert.doesNotMatch(row[field],/\p{Script=Han}/u);
  for(const collection of ['goals','budgets','recurring']){
    const values=state=>state.journal[collection].map(row=>[row.amount??row.targetAmount,row.currentAmount??null,row.currency,row.anchorDate??row.targetDate??row.month]).sort();
    assert.deepEqual(values(zh),values(en));
  }
});

test('USD FX quotes reconcile the two small overseas settlement balances',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],fx=state.market.quotes.filter(row=>row.kind==='fx');
    assert.deepEqual(fx.map(row=>row.symbol).sort(),['EUR/USD','GBP/USD']);
    assert.ok(fx.every(row=>row.currency==='USD'&&row.status==='example'));
    const expected=new Map([['EUR','972.00'],['GBP','576.00']]);
    const usdRate=fraction(state.valuation.rates.find(row=>row.currency==='USD').rate);
    const converted=state.accounts.map(account=>{
      if(account.currency==='USD')return account.amount;
      const quote=fx.find(row=>row.symbol===`${account.currency}/USD`),value=multiply(account.amount,quote.price);
      assert.equal(value,expected.get(account.currency));
      assert.equal(state.valuation.convertedAccounts.find(row=>row.accountId===account.id).amount,value);
      const source=fraction(state.valuation.rates.find(row=>row.currency===account.currency).rate),rate=fraction(quote.price);
      assert.equal(source.n*usdRate.d*rate.d,rate.n*source.d*usdRate.n);
      return value;
    });
    assert.equal(sum(converted),state.valuation.assets);
  }
});

test('shared securities have one quote linked to every holding across brokerage and retirement accounts',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],quotes=state.market.quotes;
    assert.equal(quotes.length,13);assert.equal(new Set(quotes.map(row=>row.id)).size,quotes.length);
    for(const position of state.positions.items){
      const matches=quotes.filter(row=>row.positionIds.includes(position.id));
      assert.equal(matches.length,1);assert.equal(matches[0].currency,position.currency);
      assert.equal(multiply(position.quantity,matches[0].price),position.recordedMarketValue);
    }
    const vti=quotes.find(row=>row.symbol==='VTI');assert.equal(vti.positionIds.length,2);
    assert.equal(quotes.find(row=>row.symbol==='CASH-USD').positionIds.length,6);
    const vested=state.positions.items.filter(row=>row.accountId==='fidelity-website-vested-stock'&&row.kind!=='cash');
    assert.equal(vested.length,1);assert.equal(vested[0].symbol,'MSFT');assert.equal(vested[0].quantity,'220');assert.equal(vested[0].recordedMarketValue,'94600.00');
    assert.equal(quotes.find(row=>row.symbol==='MSFT').positionIds.length,2);
    assert.ok(state.journal.memories.some(row=>/unvested RSU|未归属 RSU/i.test(row.text)));
  }
});

test('semi-monthly net pay and restricted payroll deposits reconcile without a second checking withdrawal',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],profile=state.example.profile,transactions=state.journal.transactions,payroll=profile.payrollPerPeriod;
    assert.equal(profile.annualBaseSalary,'240000.00');assert.equal(profile.monthlyTakeHomePay,'11800.00');assert.equal(profile.payFrequency,'semimonthly');
    assert.equal(multiply(payroll.gross,'24'),profile.annualBaseSalary);assert.equal(multiply(payroll.netPay,'2'),profile.monthlyTakeHomePay);
    assert.equal(fixed(minor(payroll.gross)-minor(payroll.taxWithholding)-minor(payroll.employee401k)-minor(payroll.hsa)-minor(payroll.healthInsurance)),payroll.netPay);
    assert.equal(sum([payroll.employee401k,payroll.employer401kMatch]),'1125.00');
    assert.equal(state.example.payroll.length,5);
    for(const period of state.example.payroll){
      const rows=transactions.filter(row=>row.occurredOn===period.paidOn&&row.kind==='income'&&row.category==='salary');
      assert.equal(rows.length,3);
      for(const [accountId,amount] of [[period.checkingAccountId,period.netPay],[period.retirementAccountId,period.retirementDeposit],[period.hsaAccountId,period.hsaDeposit]]){
        const match=rows.filter(row=>row.accountId===accountId);assert.equal(match.length,1);assert.equal(match[0].amount,amount);assert.equal(match[0].recurringOccurrenceOn,period.scheduledOn);
      }
    }
    const paycheckRows=transactions.filter(row=>row.kind==='income'&&row.category==='salary');
    assert.equal(sum(paycheckRows.filter(row=>row.accountId==='chase-website-everyday').map(row=>row.amount)),'29500.00');
    assert.equal(sum(paycheckRows.filter(row=>row.accountId==='fidelity-website-401k').map(row=>row.amount)),'5625.00');
    assert.equal(sum(paycheckRows.filter(row=>row.accountId==='fidelity-website-hsa').map(row=>row.amount)),'750.00');
    assert.ok(!transactions.some(row=>row.kind==='transfer'&&['fidelity-website-401k','fidelity-website-hsa'].includes(row.toAccountId)));
    assert.ok(!transactions.some(row=>row.kind==='expense'&&row.category==='salary'));
    assert.ok(!transactions.some(row=>row.kind==='expense'&&/health premium|payroll withholding|医保代扣|工资预扣/i.test(row.merchant)));
    for(const [month,total] of [['2026-08','14705.00'],['2026-09','14705.00'],['2026-10','7530.00']]){
      const income=transactions.filter(row=>row.kind==='income'&&row.occurredOn.startsWith(month));
      assert.ok(income.every(row=>row.currency==='USD'));assert.equal(sum(income.map(row=>row.amount)),total);
    }
    assert.ok(state.analysis.budgets.every(row=>row.currency==='USD'&&row.spent.complete&&minor(row.spent.amount)>0n));
    assert.equal(state.analysis.budgets.find(row=>row.subcategory==='AI').spent.amount,'60.00');
  }
});

test('selling already-vested RSUs changes shares into cash and the withdrawal is not new income',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],sale=state.example.equitySales[0],transactions=state.journal.transactions;
    assert.equal(state.example.equitySales.length,1);assert.equal(sale.proceedsAreIncome,false);
    assert.equal(multiply(sale.quantitySold,sale.salePrice),sale.grossProceeds);
    assert.equal(fixed(minor(sale.grossProceeds)-minor(sale.fees)),sale.netProceeds);
    assert.equal(fixed(minor(sale.netProceeds)-minor(sale.transferredToChecking)),sale.retainedProceeds);
    assert.equal(sum([sale.openingCash,sale.retainedProceeds]),sale.closingCash);
    assert.equal(BigInt(sale.openingQuantity)-BigInt(sale.quantitySold),BigInt(sale.remainingQuantity));
    const position=state.positions.items.find(row=>row.accountId===sale.accountId&&row.kind==='stock'),cash=state.positions.items.find(row=>row.accountId===sale.accountId&&row.kind==='cash');
    assert.equal(position.quantity,sale.remainingQuantity);assert.equal(cash.recordedMarketValue,sale.closingCash);
    assert.equal(sum([position.recordedMarketValue,cash.recordedMarketValue]),'98388.00');
    assert.ok(!transactions.some(row=>row.kind==='income'&&row.accountId===sale.accountId));
    assert.ok(!transactions.some(row=>row.kind==='income'&&[sale.grossProceeds,sale.netProceeds,sale.transferredToChecking].includes(row.amount)));
    const fee=transactions.filter(row=>row.accountId===sale.accountId&&row.kind==='expense');assert.equal(fee.length,1);assert.equal(fee[0].amount,sale.fees);
    const withdrawal=transactions.filter(row=>row.accountId===sale.accountId&&row.kind==='transfer');assert.equal(withdrawal.length,1);assert.equal(withdrawal[0].amount,sale.transferredToChecking);assert.equal(withdrawal[0].toAccountId,'chase-website-everyday');
    const homeTransfer=transactions.find(row=>row.kind==='transfer'&&row.amount==='25000.00');assert.equal(homeTransfer.accountId,'chase-website-everyday');assert.equal(homeTransfer.toAccountId,'schwab-website-taxable');
    const opening=state.example.reconciliation.accounts.find(row=>row.accountId===sale.accountId);
    assert.equal(opening.openingAmount,'118000.00');assert.equal(opening.valuationChange,'10400.00');
    const openingStock=multiply(sale.openingQuantity,sale.openingPrice);assert.equal(sum([openingStock,sale.openingCash]),opening.openingAmount);
    assert.equal(fixed(minor(position.recordedMarketValue)+minor(sale.grossProceeds)-minor(openingStock)),opening.valuationChange);
  }
});

test('renting, emergency reserves and the SGOV down payment have distinct and existing sources',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],journal=state.journal,positions=state.positions.items;
    const rent=journal.recurring.find(row=>row.kind==='bill'&&row.amount==='4200.00');assert.ok(rent);assert.equal(rent.accountId,'chase-website-everyday');
    assert.equal(journal.transactions.filter(row=>row.recurringId===rent.id).length,3);
    const broker=positions.filter(row=>row.accountId==='schwab-website-taxable');
    const downPayment=sum(broker.filter(row=>row.symbol==='SGOV'||row.kind==='cash').map(row=>row.recordedMarketValue));
    assert.equal(downPayment,'98750.00');assert.ok(journal.goals.some(row=>row.currentAmount===downPayment&&row.targetAmount==='300000.00'));
    const emergency=state.accounts.find(row=>row.id==='ally-website-emergency');assert.ok(journal.goals.some(row=>row.currentAmount===emergency.amount&&row.targetAmount==='72000.00'));
    assert.ok(minor('6000')+minor('2000')<=minor(state.accounts.find(row=>row.id==='chase-website-everyday').amount));
    assert.ok(!state.accounts.some(row=>row.assetType==='real_estate'));assert.ok(!state.liabilities.some(row=>row.liabilityType==='mortgage'));
    for(const name of ['PG&E','Comcast','Caltrain','ChatGPT Plus','Claude Pro','Cursor Pro'])assert.ok(journal.recurring.some(row=>row.name.includes(name)),name);
    for(const name of ["Trader Joe's",'Whole Foods'])assert.ok(journal.transactions.some(row=>row.merchant.includes(name)),name);
  }
});

test('three months of transfers, card purchases and refunds reconcile from opening to closing balances',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],all=[...state.accounts,...state.liabilities],transactions=state.journal.transactions;
    assert.deepEqual([...new Set(transactions.map(row=>row.occurredOn.slice(0,7)))].sort(),['2026-08','2026-09','2026-10']);
    const balances=new Map(state.example.reconciliation.accounts.map(row=>[row.accountId,minor(row.openingAmount)]));
    assert.ok([...balances.values()].every(value=>value>=0n));
    for(const row of transactions){
      const from=all.find(account=>account.id===row.accountId),amount=minor(row.amount);
      assert.equal(from.currency,row.currency);assert.ok(row.occurredOn<=state.example.asOf);
      const debit=row.kind==='income'?amount:row.kind==='expense'&&from.kind==='liability'?amount:-amount;
      balances.set(from.id,balances.get(from.id)+debit);
      if(row.kind==='transfer'){
        const to=all.find(account=>account.id===row.toAccountId);assert.equal(to.currency,row.currency);
        balances.set(to.id,balances.get(to.id)+(to.kind==='liability'?-amount:amount));
      }
    }
    for(const row of state.example.reconciliation.accounts){
      assert.equal(fixed(balances.get(row.accountId)+minor(row.valuationChange)),row.closingAmount);
      assert.equal(row.closingAmount,all.find(account=>account.id===row.accountId).amount);
    }
    for(const month of ['2026-08','2026-09','2026-10']){
      const options={month,today:state.example.asOf,currency:state.valuation.currency,rates:state.valuation.rates};
      const full=analyzeFinanceJournal(state.journal,options),withoutTransfers=analyzeFinanceJournal({...state.journal,transactions:transactions.filter(row=>row.kind!=='transfer')},options);
      assert.equal(full.coverage.transactionCount,({'2026-08':39,'2026-09':43,'2026-10':37})[month]);assert.equal(full.coverage.transferCount,month==='2026-09'?7:5);
      for(const metric of ['expenses','income','netCashFlow'])assert.deepEqual(full.spending[metric],withoutTransfers.spending[metric]);
    }
    assert.equal(transactions.filter(row=>minor(row.amount)<0n).length,1);
  }
});

test('history, plans and weekly reports have comparable complete records and real source links',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],journal=state.journal,snapshots=journal.snapshots;
    assert.equal(snapshots.length,7);assert.equal(snapshots[0].date,'2026-07-31');assert.equal(snapshots.at(-1).date,state.example.asOf);
    for(const snapshot of snapshots){
      assert.equal(snapshot.valuation.complete,true);assert.equal(snapshot.accounts.length,14);
      assert.equal(snapshot.timeZone,'America/Los_Angeles');
      assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:snapshot.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(snapshot.capturedAt)),snapshot.date);
      assert.equal(fixed(minor(snapshot.valuation.assets)-minor(snapshot.valuation.liabilities)),snapshot.valuation.net);
      assert.ok(snapshot.accounts.every(row=>minor(row.amount)>=0n&&row.asOf===snapshot.date));
      assert.deepEqual(snapshot.scope,snapshots[0].scope);
    }
    assert.equal(snapshots.at(-1).valuation.net,state.valuation.net);
    assert.equal(journal.recurring.length,22);assert.equal(journal.goals.length,4);assert.equal(journal.budgets.length,5);
    assert.equal(journal.creditRecords.length,4);assert.equal(journal.watchlist.length,4);assert.equal(journal.memories.length,6);
    assert.ok(journal.recurring.some(row=>row.kind==='income'));assert.ok(journal.recurring.some(row=>row.frequency==='yearly'));
    assert.ok(journal.watchlist.every(row=>state.market.quotes.some(quote=>quote.id===row.quoteId&&quote.currency===row.currency)));
    const report=buildFinanceWeeklyReport(journal,{through:state.example.asOf,today:state.example.asOf,currency:state.valuation.currency,rates:state.valuation.rates});
    assert.ok(report.current.transactionCount>0&&report.previous.transactionCount>0);
    assert.equal(report.netWorth.reason,null);assert.equal(report.credit.reason,null);assert.equal(report.credit.change,9);
    assert.deepEqual(report.coverage.missingCurrencies,[]);assert.ok(report.upcoming.items.length>=2);
    const ids=new Set(Object.values(journal).filter(Array.isArray).flat().map(row=>row.id));
    assert.ok(report.sources.recordIds.every(id=>ids.has(id)));
  }
});
test('dated credit utilization agrees with card balances reconstructed from opening balances and transactions',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'],cards=state.liabilities.filter(row=>row.liabilityType==='credit_card');
    for(const report of state.journal.creditRecords){
      let balance=0n;
      for(const card of cards){
        let amount=minor(state.example.reconciliation.accounts.find(row=>row.accountId===card.id).openingAmount);
        for(const row of state.journal.transactions.filter(row=>row.occurredOn<=report.asOf)){
          if(row.accountId===card.id)amount+=row.kind==='expense'?minor(row.amount):row.kind==='income'?minor(row.amount):-minor(row.amount);
          if(row.kind==='transfer'&&row.toAccountId===card.id)amount-=minor(row.amount);
        }
        assert.ok(amount>=0n);balance+=amount;
      }
      assert.equal(report.factors[0].value,`${fixed(balance*100n,minor('35000'))}%`);
    }
  }
});
test('every dated snapshot includes payroll deposits, healthcare payments and the stock withdrawal',()=>{
  for(const example of Object.values(examples)){
    const snapshots=example.responses['/finance/state'].journal.snapshots;
    const expected=[
      ['2026-07-31','227355.00','11490.00','118000.00'],['2026-08-31','233355.00','11900.00','120600.00'],
      ['2026-09-30','240855.00','12422.00','94228.00'],['2026-10-04','242355.00','12504.00','95268.00'],
      ['2026-10-11','243855.00','12586.00','96308.00'],['2026-10-18','246480.00','12708.00','97348.00'],['2026-10-25','247980.00','12790.00','98388.00'],
    ];
    for(const [date,retirement,hsa,stock] of expected){
      const snapshot=snapshots.find(row=>row.date===date);assert.ok(snapshot);
      for(const [id,amount] of [['fidelity-website-401k',retirement],['fidelity-website-hsa',hsa],['fidelity-website-vested-stock',stock]])assert.equal(snapshot.accounts.find(row=>row.id===id).amount,amount,`${date}: ${id}`);
    }
  }
});

test('all seven Finance views use the Bay Area persona without old housing or occupation remnants',()=>{
  for(const example of Object.values(examples)){
    const state=example.responses['/finance/state'];
    assert.deepEqual(state.journal.dashboard.enabled,[...FINANCE_WIDGET_IDS]);
    assert.ok(state.analysis.spending.expenses.complete);assert.ok(minor(state.analysis.spending.expenses.amount)>0n);
    assert.equal(state.accounts.filter(row=>row.assetType==='investment').length,6);assert.equal(heldMarketRows(state).length,13);
    assert.equal(state.journal.goals.length,4);assert.equal(state.journal.budgets.length,5);assert.equal(state.journal.snapshots.length,7);assert.equal(state.journal.creditRecords.length,4);
    assert.doesNotMatch(JSON.stringify(state),/Portland|Seattle|Caspian|Cedar Loop|design consulting|design-project|波特兰|西雅图|设计顾问|设计项目|rental-property|投资房|房产税|投资公寓/i);
    assert.ok([...state.accounts,...state.liabilities,...state.journal.transactions,...state.journal.recurring,...state.journal.goals,...state.journal.budgets].every(row=>!['CNY','CNH','HKD','SGD','CAD','JPY'].includes(row.currency)));
  }
});
test('Finance analysis uses the selected month and currency without mutating its authored snapshot',()=>{
  const state=examples.zh.responses['/finance/state'],before=structuredClone(state);
  const month=financeExampleResponse(state,'/journal/analysis',{month:'2026-09',currency:'USD'},'POST').analysis;
  assert.equal(month.month,'2026-09');assert.equal(month.currency,'USD');
  const weekly=financeExampleResponse(state,'/journal/weekly',{through:'2026-10-25',currency:'EUR'},'POST').report;
  assert.ok(weekly);assert.deepEqual(state,before);
  for(const route of ['/connections/moomoo/start','/connections/moomoo/appkey/configure','/accounts','/positions/updates','/market/refresh'])assert.equal(financeExampleResponse(state,route,{},'POST'),undefined);
});
test('website navigation preferences remain isolated to each disposable example',()=>{
  const first=new ExampleRuntime(examples.zh),second=new ExampleRuntime(examples.zh);
  assert.equal(first.response('/settings/navigation'),null);
  first.response('/settings/navigation','PUT',{pin:{id:'finance',pinned:true}});
  assert.deepEqual(first.response('/settings/navigation').pinned,['finance']);
  assert.equal(second.response('/settings/navigation'),null);
  assert.throws(()=>first.response('/settings/navigation','PUT',{pin:{id:'private',pinned:true}}));
  assert.throws(()=>first.response('/finance/accounts','POST',{}),error=>error.code==='showcase_read_only');
});
test('browser Finance date validation is extracted from the desktop without persistence imports',async()=>{
  const source=portableFinanceDates(readFileSync(new URL('../server/finance/journal.mjs',import.meta.url),'utf8'),new URL('../server/finance/arithmetic.mjs',import.meta.url).href);
  assert.doesNotMatch(source,/randomUUID|FinanceJournal|market\.mjs|store\./);
  const dates=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(dates.journalMonth('2026-10'),'2026-10');assert.throws(()=>dates.journalDay('2026-02-30'));
});
