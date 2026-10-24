import {ASSET_TYPES,LIABILITY_TYPES,accountTypeOf,isValuedAssetType,ownedAssetValue} from '../../shared/asset-taxonomy.mjs';
import {date,decimal,digest,fail,fields,money,text} from './arithmetic.mjs';

export function accountClassification(input,kind){
  const own=kind==='asset'?'assetType':'liabilityType',other=kind==='asset'?'liabilityType':'assetType';
  if(input[other]!==undefined)fail('分类与资产或负债类型不一致。');
  if(input[own]===undefined)return {};
  if(!(kind==='asset'?ASSET_TYPES:LIABILITY_TYPES).some(row=>row.value===input[own]))fail('请选择支持的资产或负债分类。');
  return {[own]:input[own]};
}
export function normalizeAssetDetails(input,{assetType,amount,asOf,accounts=[],now=Date.now()}={}){
  if(!isValuedAssetType(assetType)){
    if(input!==undefined&&input!==null)fail('此账户分类不使用独立资产估值资料。');
    return null;
  }
  if(!input)fail('请补充资产总估值、本人份额及估值来源。');
  fields(input,['totalValue','ownershipPercent','acquiredAmount','acquiredOn','valuationSource','valuationAsOf','linkedLiabilityIds','valueBasis']);
  const totalValue=money(input.totalValue),ownershipPercent=decimal(input.ownershipPercent,{places:6});
  const owned=ownedAssetValue(totalValue,ownershipPercent);
  if(owned===null)fail('本人持有比例须大于 0 且不超过 100%。');
  if(owned!==amount)fail('账户金额须等于资产总估值乘以本人持有比例。','finance_owned_value_mismatch',409);
  const valuationAsOf=date(input.valuationAsOf,now);
  if(valuationAsOf!==asOf)fail('估值日期须与本次资产记录日期一致。','finance_valuation_date_mismatch',409);
  const acquiredAmount=input.acquiredAmount==null||input.acquiredAmount===''?null:money(input.acquiredAmount);
  const acquiredOn=input.acquiredOn==null||input.acquiredOn===''?null:date(input.acquiredOn,now);
  if(acquiredOn&&Date.parse(acquiredOn)>Date.parse(valuationAsOf))fail('购入日期不能晚于估值日期。');
  const linkedLiabilityIds=input.linkedLiabilityIds??[];
  if(!Array.isArray(linkedLiabilityIds)||linkedLiabilityIds.length>30||linkedLiabilityIds.some(id=>typeof id!=='string'||!id)||new Set(linkedLiabilityIds).size!==linkedLiabilityIds.length)fail('关联负债须为不重复的本空间负债记录。');
  if(linkedLiabilityIds.some(id=>!accounts.some(account=>account.id===id&&account.kind==='liability')))fail('关联负债不存在于当前空间的有效负债记录中。','finance_liability_not_found',404);
  const valueBasis=assetType==='insurance'?'cash_value':'market_value';
  if(input.valueBasis!==undefined&&input.valueBasis!==valueBasis)fail('保险资产只能记录现金价值，其他资产须记录当前估值。');
  return {totalValue,ownershipPercent,acquiredAmount,acquiredOn,valuationSource:text(input.valuationSource,'估值来源',500),valuationAsOf,linkedLiabilityIds:[...linkedLiabilityIds],valueBasis};
}
export function financeAccountRevision(account){
  return digest({id:account.id,kind:account.kind,name:account.name,description:account.description??'',amount:account.amount,currency:account.currency,asOf:account.asOf,updatedAt:account.updatedAt,latestUpdateId:account.latestUpdateId,assetType:account.assetType??null,liabilityType:account.liabilityType??null,assetDetails:account.assetDetails??null,profileUpdatedAt:account.profileUpdatedAt??null});
}
export function withAccountProfile(account,profiles={}){
  const profile=profiles[account.id],manual=account.provider==='manual'&&account.readOnly===false;
  const result={...account,...(profile&&profile.kind===account.kind?{name:profile.name,description:profile.description,...(account.kind==='liability'?{liabilityType:profile.liabilityType}:{assetType:profile.assetType}),profileUpdatedAt:profile.updatedAt}:{}),canEditProfile:true,canEditAssetDetails:manual,profileOrigin:profile?'local_overlay':manual?'manual':'source'};
  if(!result.assetType&&account.kind==='asset'&&account.provider==='moomoo')result.assetType='investment';
  result.accountRevision=financeAccountRevision(result);
  return result;
}
export function requiresAssetDetails(account){return account.kind==='asset'&&isValuedAssetType(accountTypeOf(account));}
