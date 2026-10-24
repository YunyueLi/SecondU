import {useId} from 'react';
import {Checkbox} from '@openai/apps-sdk-ui/components/Checkbox';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Field} from '../components';
import {ownedAssetValue,type FinanceAssetDetails} from '../../shared/asset-taxonomy.mjs';
import {money} from './model';
import type {FinanceAccount,FinanceState} from './types';
import './asset-forms.css';

export type AssetDetailsDraft={totalValue:string;ownershipPercent:string;acquiredAmount:string;acquiredOn:string;valuationSource:string;linkedLiabilityIds:string[]};
export function assetDetailsDraft(account?:FinanceAccount):AssetDetailsDraft{
  const detail=account?.assetDetails as FinanceAssetDetails|undefined;
  return {totalValue:detail?.totalValue||account?.bookAmount||account?.amount||'',ownershipPercent:detail?.ownershipPercent||'100',acquiredAmount:detail?.acquiredAmount||'',acquiredOn:detail?.acquiredOn?.slice(0,10)||'',valuationSource:detail?.valuationSource||'',linkedLiabilityIds:[...(detail?.linkedLiabilityIds||[])]};
}
export function assetDetailsPayload(draft:AssetDetailsDraft,assetType:string,asOf:string):FinanceAssetDetails{
  return {...draft,acquiredAmount:draft.acquiredAmount||null,acquiredOn:draft.acquiredOn||null,valuationAsOf:asOf,valueBasis:assetType==='insurance'?'cash_value':'market_value'};
}
export function AssetDetailsFields({assetType,currency,asOf,draft,onChange,state,disabled=false,hidden=false}:{assetType:string;currency:string;asOf:string;draft:AssetDetailsDraft;onChange:(value:AssetDetailsDraft)=>void;state?:FinanceState;disabled?:boolean;hidden?:boolean}){
  const id=useId(),insurance=assetType==='insurance',liabilities=state?.liabilities||[];
  const change=(key:keyof AssetDetailsDraft,value:string)=>onChange({...draft,[key]:value});
  const field=(key:Exclude<keyof AssetDetailsDraft,'linkedLiabilityIds'>,label:string,required=false,type='text')=><Field label={label}><Input id={`${id}-${key}`} type={hidden&&['totalValue','acquiredAmount'].includes(key)?'password':type} value={draft[key]} onChange={event=>change(key,event.target.value)} required={required} disabled={disabled} inputMode={['totalValue','ownershipPercent','acquiredAmount'].includes(key)?'decimal':undefined} maxLength={key==='valuationSource'?500:undefined} max={type==='date'?asOf.slice(0,10):undefined}/></Field>;
  return <div className="finance-asset-details-fields">
    <div className="finance-asset-fields-grid">{field('totalValue',`${insurance?'保单现金价值':'资产总估值'}（${currency}）`,true)}{field('ownershipPercent','本人持有比例（%）',true)}</div>
    <p className="finance-asset-owned-value">计入我的资产：<strong>{money(ownedAssetValue(draft.totalValue,draft.ownershipPercent),hidden)} {currency}</strong></p>
    {insurance&&<p className="form-footnote">填写保单当前可领取的现金价值。保障额度不计入资产。</p>}
    <div className="finance-asset-fields-grid">{field('acquiredAmount',`购入总金额（${currency}，可选）`)}{field('acquiredOn','购入日期（可选）',false,'date')}</div>
    {field('valuationSource',insurance?'现金价值来源':'估值来源',true)}
    <fieldset className="finance-linked-liabilities" disabled={disabled}><legend>关联已有负债（可选）</legend>{liabilities.length?liabilities.map(account=><Checkbox key={account.id} label={`${account.name}，${money(account.amount,hidden)} ${account.currency}`} checked={draft.linkedLiabilityIds.includes(account.id)} disabled={disabled} onCheckedChange={checked=>onChange({...draft,linkedLiabilityIds:checked?[...draft.linkedLiabilityIds,account.id]:draft.linkedLiabilityIds.filter(value=>value!==account.id)})}/>):<p className="form-footnote">添加负债后，可在资产资料中关联。</p>}{draft.linkedLiabilityIds.filter(value=>!liabilities.some(account=>account.id===value)).map(value=><Checkbox key={value} label="已关联负债当前不在有效列表中" checked disabled={disabled} onCheckedChange={()=>onChange({...draft,linkedLiabilityIds:draft.linkedLiabilityIds.filter(id=>id!==value)})}/>)}<p className="form-footnote">贷款在负债中单独计算，关联后不会再次扣减这项资产价值。</p></fieldset>
  </div>;
}
