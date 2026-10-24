import {useId,useRef,useState,type FormEvent} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Field} from '../components';
import {ASSET_TYPES,LIABILITY_TYPES,accountTypeOf,isValuedAssetType,ownedAssetValue} from '../../shared/asset-taxonomy.mjs';
import {AssetDetailsFields,assetDetailsDraft,assetDetailsPayload} from './AssetDetailsFields';
import {FinanceTypeOption} from './FinanceIcon';
import {financeRequest} from './api';
import {date,money} from './model';
import type {FinanceAccount,FinanceState} from './types';
import './finance-record-form.css';

export function AccountProfileForm({account,state,hidden,onSaved}:{account:FinanceAccount;state?:FinanceState;hidden:boolean;onSaved:(state:FinanceState)=>void|Promise<void>}){
  const id=useId(),key=useRef(crypto.randomUUID()),revision=useRef(account.accountRevision);
  const [name,setName]=useState(account.name),[description,setDescription]=useState(account.description||'');
  const [classification,setClassification]=useState(accountTypeOf(account));
  const [details,setDetails]=useState(()=>assetDetailsDraft(account)),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const liability=account.kind==='liability',valued=!liability&&account.canEditAssetDetails===true&&isValuedAssetType(classification);
  const classificationOptions=[...(liability?LIABILITY_TYPES:ASSET_TYPES)].map(option=>({...option,iconKind:liability&&option.value==='other'?'other_liability':option.value}));
  const changed=()=>{key.current=crypto.randomUUID();setError('');};
  const save=async(event:FormEvent)=>{
    event.preventDefault();if(saving)return;setError('');
    if(valued&&ownedAssetValue(details.totalValue,details.ownershipPercent)!==ownedAssetValue(account.bookAmount||account.amount,'100')){setError('资料中的归属价值须与当前记录一致。需要调整金额时，请使用资产估值更新。');return;}
    setSaving(true);
    try{
      const result=await financeRequest<{state:FinanceState}>('/accounts/profile',{idempotencyKey:key.current,accountId:account.id,expectedAccountRevision:revision.current,name:name.trim(),description:description.trim(),...(liability?{liabilityType:classification}:{assetType:classification}),...(valued?{assetDetails:assetDetailsPayload(details,classification,account.asOf)}:{})},'PUT');
      if(result.state?.revision==null)throw new Error('资料已提交，返回状态不完整。请保留输入并重试确认。');
      await onSaved(result.state);
    }catch(failure){setError(failure instanceof Error?failure.message:'账户资料保存失败。');}finally{setSaving(false);}
  };
  return <form className="update-form finance-record-form finance-account-profile-form" onSubmit={save}>
    <Field label={liability?'负债名称':'资产或账户名称'}><Input id={`${id}-name`} value={name} onChange={event=>{setName(event.target.value);changed();}} maxLength={200} required disabled={saving}/></Field>
    <Field label={liability?'负债类型':'资产类型'}><Select id={`${id}-type`} value={classification} options={classificationOptions} OptionView={FinanceTypeOption} TriggerView={FinanceTypeOption} onChange={option=>{setClassification(option.value);changed();}} disabled={saving} pill={false}/></Field>
    <p className="form-footnote">当前记录 {money(account.bookAmount||account.amount,hidden)} {account.currency}，{date(account.asOf)}。{account.canEditAssetDetails!==true?'本地资料用于分类与展示，金额仍由来源更新。':''}</p>
    {valued&&<AssetDetailsFields assetType={classification} currency={account.currency} asOf={account.asOf} draft={details} onChange={next=>{setDetails(next);changed();}} state={state} disabled={saving} hidden={hidden}/>}
    <Field label="说明（可选）"><Textarea id={`${id}-description`} rows={3} value={description} onChange={event=>{setDescription(event.target.value);changed();}} maxLength={2000} disabled={saving}/></Field>
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><Button type="submit" color="primary" pill={false} loading={saving}>保存资料</Button></div>
  </form>;
}
