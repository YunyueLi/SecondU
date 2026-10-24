import type {FinanceAccount,FinanceState} from './types';

type SourceRecord=Record<string,any>;
export type SourceDetailFact={label:string;amount:string|null;display?:string;approximate?:boolean;currency?:string;unit?:string;asOf:string|null};
export type SourceDetailGroup={id:string;label:string;facts:SourceDetailFact[];asOf:string|null;historical:boolean};
export type SourceInvestmentPlan={id:string;name:string;amount:string;currency:string;frequency:string;funding:string|null;confirmedOn:string|null;startDate:string|null;tradingDayRule:string|null;nextExecutionDate:string|null};
const record=(value:unknown):SourceRecord|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as SourceRecord:undefined;
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
const decimal=(value:unknown)=>typeof value==='string'||typeof value==='number'?(/^[+-]?\d+(?:\.\d+)?$/.test(String(value).trim())?String(value).trim():null):null;
const firstAmount=(source:SourceRecord|undefined,fields:string[])=>{
  for(const field of fields){const amount=decimal(source?.[field]);if(amount!==null)return amount;}
  return null;
};
const currency=(value:unknown)=>typeof value==='string'&&/^[A-Z]{3}$/.test(value)?value:undefined;
const list=(value:unknown):SourceRecord[]=>Array.isArray(value)?value.map(record).filter((item):item is SourceRecord=>!!item):[];
export function sourceDetailDate(value:unknown):string|null{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return null;
  const clock=value.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if(clock&&(Number(clock[1])>=24||Number(clock[2])>=60||Number(clock[3])>=60))return null;
  const day=value.slice(0,10),stamp=Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===day&&Number.isFinite(Date.parse(value))?value:null;
}
const detailDate=(row:SourceRecord|undefined)=>sourceDetailDate(row?.asOf)||sourceDetailDate(row?.recordAsOf)||sourceDetailDate(row?.recordedAsOf)||sourceDetailDate(row?.as_of)||sourceDetailDate(row?.fetchedAt);
const provider=(account:FinanceAccount)=>text(account.provider)||text(typeof account.institution==='object'?account.institution?.id:account.institution);
const belongs=(account:FinanceAccount,key:string)=>account.id===key||account.id.startsWith(`${key}-`)||account.id.startsWith(`${key}_`)||provider(account)===key;
const ownerMatches=(detail:SourceRecord,account:FinanceAccount)=>!detail.accountId||detail.accountId===account.id;

function sourceFor(state:FinanceState,account:FinanceAccount):SourceRecord|undefined{
  const own=record(account.details)||record(account.funds);
  if(own)return ownerMatches(own,account)?own:undefined;
  // A current display layer deliberately replaces the old detail map, including empty arrays.
  const details=record(state.displayData)?record(state.displayData.details):record(state.snapshot?.details);
  if(!details)return undefined;
  const explicitKey=text(account.detailKey);
  if(explicitKey){
    const detail=record(details[explicitKey]);
    const shared=state.accounts.some(other=>other.id!==account.id&&other.detailKey===explicitKey);
    if(detail&&!shared&&ownerMatches(detail,account))return detail;
    return undefined;
  }
  const direct=record(details[account.id]);
  if(direct)return ownerMatches(direct,account)?direct:undefined;
  const owned=Object.values(details).map(record).filter(detail=>detail?.accountId===account.id);
  if(owned.length===1)return owned[0];
  const matches=Object.entries(details).filter(([key,value])=>record(value)&&belongs(account,key));
  if(matches.length!==1)return undefined;
  const [key,raw]=matches[0],detail=raw as SourceRecord;
  if(!ownerMatches(detail,account))return undefined;
  const siblings=state.accounts.filter(other=>belongs(other,key));
  if(siblings.length===1)return detail;
  const children=Object.entries(detail).filter(([childKey,value])=>record(value)&&(account.id===`${key}-${childKey}`||account.id===`${key}_${childKey}`));
  if(children.length===1){const [childKey,child]=children[0];return ownerMatches(child as SourceRecord,account)?{currency:detail.currency,asOf:detailDate(detail),[childKey]:child}:undefined;}
  // This source schema stores CMB's cash-management product beside a separate gold account.
  // Attribute it only to the single product-total account; never copy the institution total.
  if(key==='cmb'&&record(detail.chaochaobao)&&ownerMatches(detail.chaochaobao,account)&&account.balance_kind==='product_total'&&siblings.filter(other=>other.balance_kind==='product_total').length===1&&currency(detail.currency)===account.currency){
    return {currency:detail.currency,chaochaobao:detail.chaochaobao};
  }
  return undefined;
}

export function accountSourceDetailsFor(state:FinanceState,accountId:string):{groups:SourceDetailGroup[];plans:SourceInvestmentPlan[]}{
  const account=state.accounts.find(item=>item.id===accountId);
  if(!account)return {groups:[],plans:[]};
  const detail=sourceFor(state,account);
  const fallbackDate=sourceDetailDate(account.detailAsOf)||sourceDetailDate(state.snapshot?.snapshot_date);
  const asOf=detailDate(detail)||fallbackDate;
  const historical=account.detailCurrent===false;
  const unitCurrency=currency(detail?.currency)||currency(account.currency);
  const groups:SourceDetailGroup[]=[];
  const group=(id:string,label:string,source:SourceRecord|undefined,fields:Array<[string,string,string?]>,base:string|null|undefined=unitCurrency)=>{
    const facts=fields.flatMap(([field,label,unit])=>{const amount=decimal(source?.[field]);return amount===null?[]:[{label,amount,...(unit?{unit}:{currency:base||undefined}),asOf:detailDate(source)||asOf}];});
    if(facts.length)groups.push({id,label,facts,asOf:detailDate(source)||asOf,historical});
  };
  group('account-cash','可用金额与存款',{available:account.available,cash_deposit:account.cash_deposit},[['available','可用金额（记录）'],['cash_deposit','现金存款']],currency(account.currency));
  for(const [field,label] of [['deposits','存款明细'],['cash','现金明细']] as const){
    const facts=list(detail?.[field]).flatMap(row=>{
      const amount=decimal(row.amount??row.display),display=amount===null?text(row.display):null;if(amount===null&&!display)return [];
      return [{label:text(row.label)||text(row.name)||`${currency(row.currency)||'原币'}${field==='deposits'?'存款':'现金'}`,amount,...(display?{display}:{}),approximate:row.precision==='rounded',currency:currency(row.currency),asOf:detailDate(row)||asOf}];
    });
    if(facts.length)groups.push({id:field,label,facts,asOf,historical});
  }
  group('cash-products','现金与其他产品',detail,[['balance','余额'],['yuebao','余额宝'],['stable_wealth','稳健理财'],['cash_total','现金合计'],['cash','现金']]);
  group('converted-cash','现金总额（账户折算）',detail,[['cash_total_usd','现金总额（账户折算）']],'USD');
  group('bank-totals','银行折算金额',detail,[['deposit_total_converted','存款总额（银行折算）'],['fund_total_converted','基金总额（银行折算）']],'CNY');
  // These aliases describe the same source subtotal; select one, never add them.
  group('asset-components','证券与基金资产（记录）',{
    asOf,
    securities:firstAmount(detail,['securities_assets','securities_nav']),
    funds:firstAmount(detail,['funds_assets','fund_nav','fund_total']),
  },[['securities','证券资产'],['funds','基金资产']]);
  group('cash-management','朝朝宝',record(detail?.chaochaobao),[['total','持有总额'],['available','可用金额（记录）'],['yesterday_income','昨日收益（记录）'],['cumulative_income','累计收益（记录）'],['seven_day_annualized_pct','综合七日年化（记录）','%']]);
  const gold=record(detail?.gold);
  if(gold&&ownerMatches(gold,account))group('gold-income','黄金收益（记录）',gold,[['today_pnl','当日收益']],currency(gold.currency)||unitCurrency);
  group('fund-income','基金收益（记录）',detail,[['fund_yesterday_income','昨日收益'],['fund_holding_pnl','持有收益'],['fund_cumulative_pnl','累计收益']]);
  list(detail?.funds).forEach((fund,index)=>group(`fund-${index}`,`${text(fund.name)||'基金'}记录收益`,fund,[['yesterday_income','昨日收益'],['holding_pnl','持有收益'],['cumulative_income','累计收益']],currency(fund.currency)||null));

  const positions=[...(state.positions?.items||[]),...(state.portfolio?.holdings||[])];
  const plans=list(state.investmentPlans?.items).flatMap(plan=>{
    const amount=decimal(plan.amount),code=currency(plan.currency);
    if(plan.accountId!==account.id||plan.status!=='user_confirmed'||plan.executionStatus!=='not_observed'||plan.affectsBalances!==false||!amount||!code||!/[1-9]/.test(amount)||amount.startsWith('-'))return [];
    if(!positions.some(position=>position.accountId===account.id&&(position.id===plan.holdingId||position.positionId===plan.holdingId)))return [];
    return [{id:text(plan.id)||plan.holdingId,name:text(plan.fundName)||'基金定投',amount,currency:code,frequency:text(plan.frequencyLabel)||({daily:'每日',weekly:'每周',monthly:'每月'} as Record<string,string>)[plan.frequency]||'频率待补充',funding:text(plan.funding?.label),confirmedOn:sourceDetailDate(plan.confirmedOn),startDate:sourceDetailDate(plan.startDate),tradingDayRule:text(plan.tradingDayRule),nextExecutionDate:sourceDetailDate(plan.nextExecutionDate)}];
  });
  return {groups,plans};
}

export type SourceAssetComponent={type:string;name:string;amount:string;currency:string;asOf:string|null};
/** Selected subtotals only: never account totals, buying power, income or rounded displays. */
export function accountAssetComponentsFor(state:FinanceState,account:FinanceAccount):SourceAssetComponent[]{
  if(account.detailCurrent===false)return [];
  const detail=sourceFor(state,account),code=currency(detail?.currency)||account.currency;
  const asOf=detailDate(detail)||sourceDetailDate(account.detailAsOf)||sourceDetailDate(account.asOf);
  const rows:SourceAssetComponent[]=[];
  const add=(type:string,name:string,value:string|null,unit=code,date=asOf)=>{if(value!==null)rows.push({type,name,amount:value,currency:unit,asOf:date});};
  const cash=firstAmount(detail,['cash_total','cash']);
  if(cash!==null)add('cash','现金',cash);
  else if(firstAmount(detail,['cash_total_usd'])!==null)add('cash','现金',firstAmount(detail,['cash_total_usd']),'USD');
  else if(firstAmount(detail,['deposit_total_converted'])!==null)add('cash','存款',firstAmount(detail,['deposit_total_converted']),'CNY');
  else if(list(detail?.deposits).length)for(const row of list(detail?.deposits)){const unit=currency(row.currency);if(unit&&row.precision!=='rounded')add('cash',text(row.name)||text(row.label)||'存款',decimal(row.amount),unit,detailDate(row)||asOf);}
  else if(list(detail?.cash).length)for(const row of list(detail?.cash)){const unit=currency(row.currency);if(unit&&row.precision!=='rounded')add('cash',text(row.name)||text(row.label)||'现金',decimal(row.amount),unit,detailDate(row)||asOf);}
  else {add('cash','现金余额',firstAmount(detail,['balance']));add('cash','现金存款',decimal(account.cash_deposit),account.currency);}
  const funds=firstAmount(detail,['funds_assets','fund_nav','fund_total']);
  if(funds!==null)add('fund','基金资产',funds);
  else add('fund','基金资产',firstAmount(detail,['fund_total_converted']),'CNY');
  add('security','证券资产',firstAmount(detail,['securities_assets','securities_nav','market_val','securities_market_value']));
  add('cash_management','余额宝',firstAmount(detail,['yuebao']));
  const cashManagement=record(detail?.chaochaobao);
  add('cash_management','朝朝宝',firstAmount(cashManagement,['total']),currency(cashManagement?.currency)||code,detailDate(cashManagement)||asOf);
  add('wealth','理财产品',firstAmount(detail,['stable_wealth']));
  return rows;
}
