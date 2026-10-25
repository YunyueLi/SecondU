import {useEffect,useRef} from 'react';
import {useSiteLanguage} from './site-language';
import spaceCover from './art/privacy-space-v1.webp';
import choiceCover from './art/privacy-choice-v1.webp';
import controlCover from './art/privacy-control-v1.webp';
import SiteGlow from './SiteGlow';
import './privacy-section.css';

export default function PrivacySection(){
 const {t}=useSiteLanguage();
 const cards=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const host=cards.current;if(!host)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)'),items=Array.from(host.querySelectorAll<HTMLElement>('.privacy-card'));
  let frame=0,visible=true;
  const draw=()=>{
   frame=0;if(!visible)return;
   const top=host.getBoundingClientRect().top;
   items.forEach((card,index)=>{
    const progress=media.matches?1:Math.max(0,Math.min(1,(innerHeight*.96-(top+card.offsetTop))/(innerHeight*.58)));
    const open=1-Math.pow(1-progress,3);
    card.style.setProperty('--privacy-open',String(open));
    card.style.setProperty('--privacy-direction',String(index-1));
   });
  };
  const update=()=>{if(!frame&&visible)frame=requestAnimationFrame(draw);};
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)update();},{rootMargin:'100px'});observer.observe(host);
  const resize=new ResizeObserver(update);resize.observe(host);
  host.dataset.reveal='scroll';addEventListener('scroll',update,{passive:true});addEventListener('resize',update);media.addEventListener('change',update);draw();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();removeEventListener('scroll',update);removeEventListener('resize',update);media.removeEventListener('change',update);};
 },[]);
 const principles=[
  {cover:spaceCover,title:t('资料，留在自己的空间','Your information, in your space'),body:t('个人与示例空间独立。官网使用虚构资料；你在此导入的内容仅存于当前页面，刷新后清空。','Personal and example spaces are separate. This website uses fictional data. Anything you import stays in this page and clears on refresh.')},
  {cover:choiceCover,title:t('每次使用，范围由你定','You choose the scope'),body:t('决定当前任务使用哪些背景、交给哪个模型。连接云模型时，只把为该任务选定的内容交给它处理。','Choose the context and model for each task. When you connect a cloud model, the context selected for that task is sent to it.')},
  {cover:controlCover,title:t('理解可改，授权可撤回','Correct, take over, or revoke'),body:t('核对与纠正理解，随时接手任务，撤回后续分享权限。你的意愿变化时，分身也随之调整。','Review and correct an understanding, take over a task, or revoke future sharing. As your wishes change, your twin should adjust.')},
 ];
 return <section className="site-section privacy-story" aria-labelledby="privacy-title">
  <div className="privacy-intro"><h2 id="privacy-title">{t('属于你的分身，','Your digital twin.')}<br/>{t('由你决定边界。','Your boundaries.')}</h2><p>{t('理解持续生长，决定始终在你。','Understanding grows. The decisions stay with you.')}</p></div>
  <div ref={cards} className="privacy-cards">{principles.map(item=><article className="privacy-card" key={item.title}><SiteGlow radius={18}/><div className="privacy-card-cover"><img src={item.cover} alt="" width="1200" height="675" loading="lazy" decoding="async"/><h3>{item.title}</h3></div><p>{item.body}</p></article>)}</div>
 </section>;
}
