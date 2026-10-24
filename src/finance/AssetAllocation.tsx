import {t} from '../i18n';
import {useEffect,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ArrowLeft,ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {AllocationDonut} from './AllocationDonut';
import {FinanceIcon} from './FinanceIcon';
import {assetAllocationFor,type AssetAllocationGroup,type AssetAllocationItem} from './asset-allocation';
import {financeAssetTypeLabel} from './labels';
import {financeSourceLabel} from './source-labels';
import {date,money,minor} from './model';
import type {FinanceState} from './types';
import './asset-allocation.css';

type Props={state:FinanceState;currency:string;nativeCurrency?:string;hidden:boolean;scope?:'all'|'investments';embedded?:boolean;onAccount:(id:string)=>void;onHolding:(id:string)=>void};
export const investmentTypes=new Set(['stock','etf','fund','bond','security','gold','crypto','option','futures','wealth','investment']);
const groupName=(group:AssetAllocationGroup)=>group.type==='investment'?t('投资待分项','Investment breakdown pending'):financeAssetTypeLabel(group.type,group.name);
const itemName=(item:AssetAllocationItem)=>item.basis!=='remainder'?(item.basis==='subtotal'?financeSourceLabel(item.name):item.name):item.type==='rounding'?financeAssetTypeLabel(item.type,item.name):item.type==='valuation_adjustment'?t('记录与当前估值的差额','Difference from current valuation'):t('账户未分项金额','Unallocated account amount');
const issueLabel=(message:string)=>{
 const labels:Record<string,string>={'账户明细待核对':'Account breakdown needs review','持仓日期与账户记录待核对':'Holding dates and account records need review','部分明细缺少币种或汇率':'Some details are missing a currency or exchange rate','分项金额与账户净值待核对':'Breakdown amounts and account value need review'};
 return labels[message]?t(message,labels[message]):message;
};
export function AssetAllocation({state,currency,nativeCurrency,hidden,scope='all',embedded=false,onAccount,onHolding}:Props){
  const [selected,setSelected]=useState<string|null>(null),allocation=assetAllocationFor(state,currency,nativeCurrency);
  useEffect(()=>setSelected(null),[currency,nativeCurrency,scope]);
  const groups=allocation.groups.filter(group=>scope==='all'||investmentTypes.has(group.type));
  const active=groups.find(group=>group.id===selected),unconverted=groups.filter(group=>group.amount===null);
  const label=scope==='investments'?t("投资组合","Investment portfolio"):t("按资产类型","By asset type");
  const known=groups.filter(group=>group.amount!==null);
  const rows=known.map(group=>({id:group.id,name:groupName(group),assetType:group.type,color:'',amount:minor(group.amount),subtitle:t(`${group.accountIds.length} 个账户`,`${group.accountIds.length} account${group.accountIds.length===1?'':'s'}`),accounts:[]}));
  const accountName=(id:string)=>state.accounts.find(account=>account.id===id)?.name||id;
  return <div className="asset-allocation">
    {active?<section className="asset-allocation-details" aria-label={t(`${groupName(active)}资产明细`, `${groupName(active)} asset details`)}>
      <header><Button color="secondary" variant="ghost" pill={false} uniform size="sm" aria-label={t("返回资产类型分布","Back to asset types")} onClick={()=>setSelected(null)}><ArrowLeft/></Button><FinanceIcon kind={active.type}/><h3>{groupName(active)}</h3><strong>{money(active.amount,hidden)} <small>{currency}</small></strong></header>
      <div className="asset-allocation-items">{active.items.map(item=><div key={item.id} className="asset-allocation-item">
        <div><strong>{itemName(item)}</strong><span>{accountName(item.accountId)}</span><small>{date(item.asOf)}{item.basis==='position'?t("，持仓市值",", holding value"):item.basis==='subtotal'?t("，账户分项",", account breakdown"):item.basis==='remainder'?t("，账户差额",", account difference"):t("，记录估值",", recorded valuation")}</small></div>
        <div><strong>{money(item.amount,hidden)} <small>{item.currency}</small></strong>{item.currency!==currency&&<small>{item.converted===null?t("待折算","Conversion pending"):t(`折合 ${money(item.converted,hidden)} ${currency}`,`Equivalent to ${money(item.converted,hidden)} ${currency}`)}</small>}</div>
        <Button color="secondary" variant="ghost" pill={false} size="sm" onClick={()=>item.positionId?onHolding(item.accountId):onAccount(item.accountId)}>{item.positionId?t("查看持仓","View holdings"):t("账户详情","Account details")}<ArrowRight/></Button>
      </div>)}</div>
    </section>:<>
      {rows.length>0&&<AllocationDonut embedded={embedded} groups={rows} currency={currency} hidden={hidden} label={unconverted.length?t(`${label}（已折算部分）`, `${label} (converted portion)`):label} onSelect={id=>setSelected(id)}/>}
      {unconverted.length>0&&<div className="asset-allocation-unconverted">{unconverted.map(group=><button key={group.id} onClick={()=>setSelected(group.id)}><FinanceIcon kind={group.type}/><span>{groupName(group)}</span><small>{t("待折算","Conversion pending")}</small><ArrowRight/></button>)}</div>}
      {!groups.length&&<p className="finance-data-meta">{t("暂无投资持仓或资产分项。","No investment holdings or asset breakdown yet.")}</p>}
      {allocation.issues.length>0&&<details className="asset-allocation-issues"><summary>{t(`${allocation.issues.length} 个账户需要核对明细`, `${allocation.issues.length} account${allocation.issues.length===1?'':'s'} ${allocation.issues.length===1?'needs':'need'} review`)}</summary>{allocation.issues.map(issue=><button key={issue.accountId} onClick={()=>onAccount(issue.accountId)}><span>{accountName(issue.accountId)}</span><small>{issueLabel(issue.message)}</small><ArrowRight/></button>)}</details>}
    </>}
  </div>;
}
