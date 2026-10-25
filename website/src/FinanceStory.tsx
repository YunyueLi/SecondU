import {useSiteLanguage} from './site-language';
import {openProductRoute} from './product-navigation';
import FinancePreview from './FinancePreview';

export default function FinanceStory(){
 const {t}=useSiteLanguage();
 return <article className="cap-story cap-finance-story" data-layout="visual-first" id="finance" aria-labelledby="finance-story-title">
  <div className="cap-story-intro">
   <h2 id="finance-story-title">{t('看清你的全部资产。','See your assets together.')}</h2>
   <p>{t('银行存款、退休储蓄、公司股票和不动产，分散在不同账户与币种里。SecondU 将它们呈现在同一张资产全景中，让你查看资产结构、核对每笔持仓，再结合负债、现金流和长期目标，安排下一步。','Bank deposits, retirement savings, company stock and property can be spread across accounts and currencies. SecondU brings them into one view so you can explore your asset mix, inspect individual holdings, and plan ahead with your liabilities, cash flow and long-term goals in mind.')}</p>
   <button className="cap-story-action" onClick={event=>openProductRoute('finance',event.currentTarget)}>{t('查看资产全景','Explore your assets')}</button>
  </div>
  <FinancePreview/>
 </article>;
}
