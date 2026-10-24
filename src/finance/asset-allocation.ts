import {accountTypeOf,isValuedAssetType,ASSET_TYPES,POSITION_TYPES} from '../../shared/asset-taxonomy.mjs';
import {accountAssetComponentsFor} from './account-source-details.ts';
import {accountAmount,decimal,displayAccounts,minor,positionsFor} from './model.ts';
import type {FinanceAccount,FinanceState} from './types';

export type AssetAllocationItem={id:string;accountId:string;positionId?:string;name:string;type:string;amount:string;currency:string;converted:string|null;baselineConverted?:string|null;asOf:string|null;basis:'account'|'position'|'subtotal'|'remainder';sourceName?:string};
export type AssetAllocationGroup={id:string;name:string;type:string;amount:string|null;items:AssetAllocationItem[];accountIds:string[]};
export type AssetAllocation={groups:AssetAllocationGroup[];items:AssetAllocationItem[];total:string|null;currency:string;issues:Array<{accountId:string;message:string}>};
const labels:Record<string,string>={...Object.fromEntries(ASSET_TYPES.map(row=>[row.value,row.label])),...Object.fromEntries(POSITION_TYPES.map(row=>[row.value,row.label])),cash:'现金与存款',cash_management:'现金管理',security:'其他证券',wealth:'理财产品',investment:'投资待分项',other:'其他资产',unclassified:'待分类',rounding:'折算尾差',valuation_adjustment:'估值差额'};
const securityTypes=new Set(['stock','etf','bond','security','option','futures']);
const valid=(value:unknown)=>typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(value);
const normalized=(value:unknown)=>valid(value)?decimal(minor(value)):null;
const sum=(rows:AssetAllocationItem[])=>rows.reduce((total,row)=>total+minor(row.converted),0n);

/** Classify the same account values used by total assets. No holding increases that total. */
export function assetAllocationFor(state:FinanceState,currency:string,nativeCurrency?:string):AssetAllocation{
  const accounts=displayAccounts(state).filter(account=>!nativeCurrency||account.currency===nativeCurrency),positions=positionsFor(state);
  const result:AssetAllocationItem[]=[],issues:AssetAllocation['issues']=[];
  for(const account of accounts){
    const explicit=accountTypeOf(account),accountTotal=accountAmount(state,account,currency);
    const convert=(amount:string,from:string)=>accountAmount(state,{...account,id:`${account.id}:allocation`,amount,currency:from},currency);
    const whole=(type:string)=>({id:`${account.id}:account`,accountId:account.id,name:account.name,type,amount:account.amount,currency:account.currency,converted:accountTotal,asOf:account.providerAsOf||account.asOf||null,basis:'account' as const,sourceName:account.sourceName});
    if(isValuedAssetType(explicit)){result.push(whole(explicit));continue;}
    if(account.projection?.reconciliationRequired){result.push(whole('unclassified'));issues.push({accountId:account.id,message:'账户明细待核对'});continue;}
    const held:AssetAllocationItem[]=positions.filter(row=>row.accountId===account.id&&row.valuation?.positionCurrent!==false).flatMap(row=>{
      const valuation=row.valuation,official=valuation?.valuationBasis==='official_api';
      if(account.detailCurrent===false&&!official)return [];
      const recordDate=valuation?.baselineAsOf||row.asOf,accountDate=account.detailAsOf||account.asOf;
      if(!official&&valuation?.positionCurrent!==true&&recordDate&&accountDate&&recordDate.slice(0,10)!==accountDate.slice(0,10)){
        if(!issues.some(issue=>issue.accountId===account.id))issues.push({accountId:account.id,message:'持仓日期与账户记录待核对'});
        return [];
      }
      const hasNative=valid(valuation?.marketValueInAccountCurrency)&&valuation?.linkedToAccount===true;
      const raw=hasNative?valuation.marketValueInAccountCurrency:official?valuation.marketValue:valuation?.linkedToAccount===true&&valid(valuation?.marketValue)?valuation.marketValue:valuation?.baselineMarketValue??row.market_value;
      const amount=normalized(raw),code=hasNative?account.currency:official?valuation.valuationCurrency:valuation?.linkedToAccount===true?valuation.valuationCurrency:valuation?.recordedCurrency||row.currency;
      if(amount===null||!code||valuation?.currencyBasis==='unconfirmed')return [];
      const kind=official?valuation.kind||row.kind:row.kind||valuation?.kind||'other',type=labels[kind]?kind:'security';
      const baseNative=normalized(valuation?.baselineValueInAccountCurrency),baseValue=normalized(valuation?.baselineMarketValue??row.market_value),baseCode=valuation?.recordedCurrency||row.currency;
      const baselineConverted=baseNative!==null?convert(baseNative,account.currency):baseValue!==null&&baseCode?convert(baseValue,baseCode):official?convert(amount,code):null;
      return [{id:`${account.id}:position:${row.id}`,accountId:account.id,positionId:row.id,name:row.name_display||row.symbol||row.id,type,amount,currency:code,converted:convert(amount,code),baselineConverted,asOf:official?valuation.fetchedAt||valuation.baselineAsOf:valuation?.linkedToAccount===true?valuation.quoteAsOf||valuation.baselineAsOf:valuation?.baselineAsOf||row.asOf||null,basis:'position' as const,sourceName:valuation?.sourceName}];
    });
    const source=accountAssetComponentsFor(state,account),used=new Set<string>();
    const components:AssetAllocationItem[]=[];
    const addHolding=(row:AssetAllocationItem)=>{components.push(row);used.add(row.id);};
    const sourceTypes=new Set(source.map(row=>row.type));
    for(const [index,part] of source.entries()){
      const converted=convert(part.amount,part.currency);
      if(part.type==='security'||part.type==='fund'){
        const securities=held.filter(row=>part.type==='security'?securityTypes.has(row.type):row.type==='fund');
        const known=securities.filter(row=>row.converted!==null&&row.baselineConverted!=null),value=converted===null?null:minor(converted),knownTotal=known.reduce((n,row)=>n+minor(row.baselineConverted),0n);
        if(value!==null&&known.length===securities.length&&knownTotal<=value){
          known.forEach(addHolding);
          const remainder=value-knownTotal;
          if(remainder!==0n)components.push({id:`${account.id}:${part.type}-remainder`,accountId:account.id,name:part.type==='fund'?'基金未分项金额':'证券未分项金额',type:part.type,amount:decimal(remainder),currency,converted:decimal(remainder),asOf:part.asOf,basis:'remainder'});
          continue;
        }
        securities.forEach(row=>used.add(row.id));
      }else held.filter(row=>row.type===part.type).forEach(row=>used.add(row.id));
      components.push({id:`${account.id}:subtotal:${index}`,accountId:account.id,name:part.name,type:part.type,amount:part.amount,currency:part.currency,converted,asOf:part.asOf,basis:'subtotal'});
    }
    held.filter(row=>!used.has(row.id)&&!(securityTypes.has(row.type)&&sourceTypes.has('security'))).forEach(addHolding);
    if(!components.length){
      const knownType=account.assetType?explicit:account.balance_kind==='deposit'?'cash':'unclassified';
      result.push(whole(knownType));continue;
    }
    if(accountTotal===null||components.some(row=>row.converted===null)){
      // A partial breakdown must not silently turn a missing rate into zero or a new total.
      result.push(whole(account.assetType?explicit:'unclassified'));
      issues.push({accountId:account.id,message:'部分明细缺少币种或汇率'});continue;
    }
    const difference=minor(accountTotal)-sum(components),tolerance=BigInt(components.length+1);
    const valuationAdjustment=sourceTypes.has('cash')&&account.projection?.residualBasis==='balancing_term_at_current_fx_not_cash';
    if(difference < -tolerance&&!valuationAdjustment){
      result.push(whole('unclassified'));issues.push({accountId:account.id,message:'分项金额与账户净值待核对'});continue;
    }
    result.push(...components);
    if(difference!==0n){
      const rounding=difference>=-tolerance&&difference<=tolerance;
      const type=rounding?'rounding':valuationAdjustment?'valuation_adjustment':account.assetType==='cash'?'cash':account.assetType==='investment'?'investment':'unclassified';
      result.push({id:`${account.id}:remainder`,accountId:account.id,name:rounding?'折算尾差':valuationAdjustment?'记录与当前估值的差额':'账户未分项金额',type,amount:decimal(difference),currency,converted:decimal(difference),asOf:account.asOf||null,basis:'remainder'});
    }
  }
  const groups=new Map<string,AssetAllocationGroup>();
  for(const item of result){const group=groups.get(item.type)||{id:item.type,type:item.type,name:labels[item.type]||'其他资产',amount:'0.00',items:[],accountIds:[]};group.items.push(item);if(!group.accountIds.includes(item.accountId))group.accountIds.push(item.accountId);group.amount=group.amount===null||item.converted===null?null:decimal(minor(group.amount)+minor(item.converted));groups.set(item.type,group);}
  const amounts=accounts.map(account=>accountAmount(state,account,currency)),total=amounts.some(value=>value===null)?null:decimal(amounts.reduce((n,value)=>n+minor(value),0n));
  return {groups:[...groups.values()].sort((a,b)=>minor(a.amount)>minor(b.amount)?-1:minor(a.amount)<minor(b.amount)?1:a.name.localeCompare(b.name,'zh-CN')),items:result,total,currency,issues};
}
