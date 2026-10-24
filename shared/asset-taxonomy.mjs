export const ASSET_TYPES=Object.freeze([
  {value:'cash',label:'现金与存款'},{value:'investment',label:'投资账户'},
  {value:'real_estate',label:'房地产'},{value:'vehicle',label:'车辆'},
  {value:'valuable',label:'贵重物品'},{value:'insurance',label:'保险现金价值'},
  {value:'receivable',label:'应收款'},{value:'business',label:'企业权益'},
  {value:'other',label:'其他资产'},
]);
export const LIABILITY_TYPES=Object.freeze([
  {value:'credit_card',label:'信用卡'},{value:'mortgage',label:'住房贷款'},
  {value:'vehicle_loan',label:'车辆贷款'},{value:'personal_loan',label:'个人借款'},
  {value:'other',label:'其他负债'},
]);
export const POSITION_TYPES=Object.freeze([
  {value:'stock',label:'股票'},{value:'etf',label:'ETF'},{value:'fund',label:'基金'},
  {value:'bond',label:'债券'},{value:'gold',label:'黄金'},{value:'crypto',label:'加密资产'},
  {value:'cash',label:'现金'},{value:'option',label:'期权'},{value:'futures',label:'期货'},
  {value:'other',label:'其他投资'},
]);
export const isValuedAssetType=value=>['real_estate','vehicle','valuable','insurance','receivable','business'].includes(value);

/** Classify only an explicit record or a known securities provider. */
export function accountTypeOf(account){
  const liability=account?.kind==='liability',value=liability?account?.liabilityType:account?.assetType;
  const options=liability?LIABILITY_TYPES:ASSET_TYPES;
  if(options.some(option=>option.value===value))return value;
  return !liability&&account?.provider==='moomoo'?'investment':'other';
}
export function accountTypeLabel(account){
  const liability=account?.kind==='liability',type=accountTypeOf(account);
  if(type==='other'&&!(liability?account?.liabilityType:account?.assetType))return liability?'待分类负债':'待分类资产';
  return (liability?LIABILITY_TYPES:ASSET_TYPES).find(option=>option.value===type)?.label||'待分类';
}

/** Total value and ownership use decimal strings; round once to an owned cent. */
export function ownedAssetValue(totalValue,ownershipPercent){
  if(typeof totalValue!=='string'||!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(totalValue)||typeof ownershipPercent!=='string'||!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(ownershipPercent))return null;
  const [whole,tail='']=totalValue.split('.'),[percentWhole,percentTail='']=ownershipPercent.split('.');
  const cents=BigInt(whole)*100n+BigInt(tail.padEnd(2,'0'));
  const scale=10n**BigInt(percentTail.length),percent=BigInt(percentWhole+percentTail);
  if(percent<=0n||percent>100n*scale)return null;
  const denominator=100n*scale,owned=(cents*percent*2n+denominator)/(denominator*2n);
  return `${owned/100n}.${String(owned%100n).padStart(2,'0')}`;
}
