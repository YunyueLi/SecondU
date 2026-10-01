import {useSiteLanguage} from './site-language';
import {openProductRoute} from './product-navigation';
import RoadmapEmblem from './RoadmapEmblem';
import './privacy-section.css';

export default function PrivacySection(){
 const {t}=useSiteLanguage();
 const principles=[
  {label:t('资料','YOUR INFORMATION'),title:t('从你的选择开始','Start with what you choose'),body:t('个人空间与示例空间独立。官网从虚构资料开始；主动导入的内容仅保存在当前页面，刷新后清空。','Personal and example spaces are separate. The website starts with fictional data; anything you choose to import stays in this page and clears on refresh.')},
  {label:t('使用','SCOPE OF USE'),title:t('每一次使用，都有范围','A scope for each use'),body:t('决定哪些背景用于当前任务，选择使用的模型。连接云模型时，为该任务选定的内容会交给它处理。','Choose the context for each task and the model to use. When you connect a cloud model, the selected task context is sent to that model.')},
  {label:t('掌握','YOUR CONTROL'),title:t('随时修正，继续由你掌握','Keep a hand in the process'),body:t('理解能够纠正，任务能够接手，后续分享权限能够撤回。你的意愿变化时，分身也应随之调整。','Correct an understanding, take over a task or revoke future sharing access. As your wishes change, your twin should adjust with you.')},
 ];
 return <section className="site-section privacy-story" aria-labelledby="privacy-title">
  <div className="privacy-intro"><span className="privacy-eyebrow">{t('信任，从边界开始','TRUST STARTS WITH BOUNDARIES')}</span><h2 id="privacy-title">{t('属于你的分身，','Your digital twin.')}<br/>{t('由你决定边界。','Your boundaries.')}</h2><p>{t('理解可以越来越深，使用与分享的范围，始终由你选择。','Understanding can grow deeper. You choose how it is used and shared.')}</p>
   <div className="privacy-illustration" aria-hidden="true"><i className="privacy-ring privacy-ring-outer"/><i className="privacy-ring privacy-ring-inner"/><div className="privacy-art"><RoadmapEmblem stage={0}/></div><span className="privacy-boundary privacy-boundary-one">{t('你允许的背景','Context you allow')}</span><span className="privacy-boundary privacy-boundary-two">{t('你选择的范围','Scope you choose')}</span><span className="privacy-boundary privacy-boundary-three">{t('你保留的决定','Decisions you keep')}</span></div>
  </div>
  <div className="privacy-principles">{principles.map((item,index)=><article key={index}><div className="privacy-principle-label"><span>0{index+1}</span><span>{item.label}</span></div><h3>{item.title}</h3><p>{item.body}</p></article>)}<button className="privacy-explore" onClick={()=>openProductRoute('self')}>{t('查看可检查、可修正的个人理解','Explore understanding you can inspect and correct')}</button></div>
 </section>;
}
