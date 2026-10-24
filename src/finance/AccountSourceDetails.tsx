import { t, useLocale } from '../i18n';
import {ChevronDown} from '@openai/apps-sdk-ui/components/Icon';
import {accountSourceDetailsFor,type SourceDetailFact} from './account-source-details';
import {date,money} from './model';
import type {FinanceAccount,FinanceState} from './types';
import {financeSourceLabel} from './source-labels';
import './account-source-details.css';



function FactValue({fact,hidden}:{fact:SourceDetailFact;hidden:boolean}){
  if(fact.unit)return <>{hidden?'••••':fact.amount}<small>{fact.unit}</small></>;
  return <>{hidden?'••••':fact.display||money(fact.amount)}<small>{fact.currency||t("币种未记录", "Currency not recorded")}{fact.approximate?t("，估算", ", estimated"):''}</small></>;
}

/** Supplemental source facts only; these rows never change the account total. */
export function AccountSourceDetails({state,account,hidden}:{state:FinanceState;account:FinanceAccount;hidden:boolean}){
  useLocale();
  const {groups,plans}=accountSourceDetailsFor(state,account.id);
  if(!groups.length&&!plans.length)return null;
  return <div className="finance-account-source-details">
    {groups.length>0&&<details className="finance-source-disclosure">
      <summary><span>{t("现金、存款与收益", "Cash, deposits and returns")}</span><ChevronDown aria-hidden="true"/></summary>
      {groups.map(group=><section className="finance-source-group" key={group.id}>
        <header><h4>{financeSourceLabel(group.label)}</h4><small>{group.historical?t("历史明细，", "Historical details, "):''}{date(group.asOf)}</small></header>
        <dl>{group.facts.map((fact,index)=><div key={`${group.id}-${index}`}><dt>{financeSourceLabel(fact.label)}{fact.asOf!==group.asOf&&<small>{date(fact.asOf)}</small>}</dt><dd><FactValue fact={fact} hidden={hidden}/></dd></div>)}</dl>
      </section>)}
    </details>}
    {plans.length>0&&<details className="finance-source-disclosure">
      <summary><span>{t("定投计划", "Recurring investments")}<small>{plans.length} {t(" 项", " plans")}</small></span><ChevronDown aria-hidden="true"/></summary>
      {plans.map(plan=><section className="finance-source-group finance-source-plan" key={plan.id}>
        <header><h4>{financeSourceLabel(plan.name)}</h4></header>
        <p>{financeSourceLabel(plan.frequency)} {money(plan.amount,hidden)} {plan.currency}{plan.funding?t(`，计划从${plan.funding}扣款。`, `, funded from ${plan.funding}.`):t("，扣款来源待补充。", ". Funding account not recorded.")}</p>
        <p className="finance-source-note">{t("尚未核验实际扣款", "Actual payment not verified")}</p>
        <dl><div><dt>{t("确认日期", "Confirmation date")}</dt><dd>{date(plan.confirmedOn)}</dd></div><div><dt>{t("开始日期", "Start date")}</dt><dd>{date(plan.startDate)}</dd></div><div><dt>{t("交易日规则", "Trading day rule")}</dt><dd>{plan.tradingDayRule||t("待补充", "Not recorded")}</dd></div><div><dt>{t("下次执行日", "Next execution date")}</dt><dd>{date(plan.nextExecutionDate)}</dd></div></dl>
      </section>)}
    </details>}
  </div>;
}
