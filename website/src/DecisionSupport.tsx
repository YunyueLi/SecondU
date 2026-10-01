import {useSiteLanguage} from './site-language';
import {openProductRoute} from './product-navigation';
import ProductPreview from './ProductPreview';
import './decision-support.css';

export default function DecisionSupport(){
 const {t}=useSiteLanguage();
 const action=t('打开职业选择讨论','Explore the career discussion');
 return <article className="cap-story decision-story" aria-labelledby="decision-title">
  <div className="cap-story-intro decision-intro">
   <h2 id="decision-title">{t('人生的重要选择，\n多一份懂你的参考。','For life’s big decisions,\na perspective that knows you.')}</h2>
   <p>{t('购房定居、选择学校、转换职业，或走向一段长期关系。结合模型的分析能力与你的经历、价值观和长期目标，梳理信息、比较得失、看清不确定性，陪你反复推敲。','A home, an education, a career change or a lasting relationship. Bring model reasoning together with your experiences, values and long-term goals to examine information, trade-offs and uncertainty over as many conversations as you need.')}</p>
   <p className="decision-agency">{t('让思考更充分，让选择仍然属于你。','More room to think. The choice remains yours.')}</p>
   <button className="cap-story-action" onClick={()=>openProductRoute('example-decision')}>{action}</button>
   <p className="decision-example-note">{t('示例展示虚构的职业选择讨论，可在工作区查看对话、编辑比较提纲。','Explore a fictional career discussion and edit its comparison outline in the workspace.')}</p>
  </div>
  <ProductPreview kind="decision-support" route="example-decision" alt={t('SecondU 真实工作区中的职业选择讨论，以及右侧可编辑的职业选择比较提纲','A career discussion in the real SecondU workspace, alongside an editable comparison outline')} action={action} className="cap-story-visual decision-visual"/>
 </article>;
}
