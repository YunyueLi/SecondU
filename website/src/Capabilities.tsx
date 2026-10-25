import {Fragment} from 'react';
import {useSiteLanguage} from './site-language';
import {openProductRoute,type ProductRoute} from './product-navigation';
import ProductPreview,{useProductPreview,type ProductPreviewKind} from './ProductPreview';
import DecisionSupport from './DecisionSupport';
import TwinBuildingStory from './TwinBuildingStory';
import FinanceStory from './FinanceStory';
import './capabilities.css';
import StoryIntroduction from './StoryIntroduction';
import {useCapabilityFlow} from './useCapabilityFlow';

export default function Capabilities(){
 const {t}=useSiteLanguage();
 const flow=useCapabilityFlow();
 const context=useProductPreview('personal-context'),task=useProductPreview('task-workspace');
 const groups:{title:string;body:string;image:string|undefined;kind:ProductPreviewKind;alt:string;route:ProductRoute;action:string}[]=[
  {title:t('越了解你，越知道从哪里开始。','Better context. A better place to start.'),body:t('经历、偏好和正在推进的目标，不必每次从头解释。SecondU 将它们组织成持续更新的个人认知，让你查看来源、修正理解，保留真正重要的背景。','Your experiences, preferences and current goals should not need explaining every time. SecondU brings them into an evolving personal profile, with sources you can review and an understanding you can correct.'),image:context.poster,kind:'personal-context',alt:t('万叶的个人画像，展示偏好、经历与有来源的个人认知','Caspian’s personal profile, with preferences, experiences and source-backed context'),route:'self',action:t('探索你的数字分身','Explore your digital twin')},
  {title:t('把对话，变成可以继续的工作。','Turn a conversation into work you can build on.'),body:t('从一项具体任务出发，把相关资料、对话和成果留在同一个空间。查看执行过程，修改文档，比较历史版本。下一次接着做，不必重新整理。','Keep the materials, conversations and results of a task together. Follow the work, edit the document and revisit earlier versions. When you return, pick up where you left off.'),image:task.poster,kind:'task-workspace',alt:t('真实 SecondU 工作区，左侧对话与右侧可编辑文档并排呈现','The real SecondU workspace, with a conversation alongside an editable document'),route:'example-chat',action:t('打开完整工作区','Open the full workspace')},
 ];
 return <section className="site-section site-capabilities" id="capabilities" aria-label={t('SecondU 产品能力','SecondU capabilities')}><StoryIntroduction/><div ref={flow} className="cap-stories"><TwinBuildingStory/>{groups.map((group,index)=><Fragment key={group.route}><article className={`cap-story cap-story-${index}${group.image?'':' without-screen'}`} data-layout="copy-first" key={group.route}><div className="cap-story-intro"><h2>{group.title}</h2><p>{group.body}</p><button className="cap-story-action" onClick={event=>openProductRoute(group.route,event.currentTarget)}>{group.action}</button></div>{group.image&&<ProductPreview kind={group.kind} route={group.route} alt={group.alt} action={group.action} className="cap-story-visual"/>}</article>{index===0&&<DecisionSupport/>}</Fragment>)}<FinanceStory/></div></section>;
}
