import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {ArrowLeft,ArrowRight,Pause,Play} from '@openai/apps-sdk-ui/components/Icon';
import {ScaledAgentBadge} from '../../src/agents/ScaledAgentBadge';
import {EXPERT_TEMPLATES,expertText} from '../../src/agents/expertTemplates';
import type {AgentProfile} from '../../shared/contracts';
import {useSiteLanguage} from './site-language';
import {openProductRoute} from './product-navigation';
import './expert-showcase.css';
import ProductPreview,{useProductPreview} from './ProductPreview';

const templates=['product-review','user-research','prototype-builder','writing-editor','data-analyst','learning-coach','life-planner','frontend-engineer','evidence-researcher'].map(id=>EXPERT_TEMPLATES.find(template=>template.id===id)).filter((value):value is typeof EXPERT_TEMPLATES[number]=>!!value);
const modulo=(value:number)=>((value%templates.length)+templates.length)%templates.length;

/** The actual expert catalogue and desktop badge, arranged on a spatial turntable. */
export default function ExpertShowcase(){
 const {language,t}=useSiteLanguage();
 const expertScreen=useProductPreview('specialists').poster;
 const [turn,setTurn]=useState(0),[faces,setFaces]=useState<Record<string,'identity'|'role'|'history'>>({});
 const [playing,setPlaying]=useState(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches),[dragging,setDragging]=useState(false);
 const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[inView,setInView]=useState(false),[hidden,setHidden]=useState(()=>document.hidden);
 const entered=useRef(false);
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const stage=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;id:number}|null>(null);
 const current=modulo(turn),template=templates[current];
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>{setReduced(query.matches);if(query.matches)setPlaying(false);};query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 useEffect(()=>{if(!stage.current)return;const observer=new IntersectionObserver(entries=>setInView(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.28)),{threshold:[0,.28,.6]});observer.observe(stage.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{const change=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 useEffect(()=>{if(!playing||reduced||hovered||focused||!inView||hidden)return;if(!entered.current){entered.current=true;setTurn(value=>value+1);}const timer=window.setInterval(()=>setTurn(value=>value+1),6000);return()=>clearInterval(timer);},[playing,reduced,hovered,focused,inView,hidden]);
 function choose(index:number){setPlaying(false);const forward=modulo(index-current);setTurn(value=>value+(forward>templates.length/2?forward-templates.length:forward));}
 function step(direction:number){setPlaying(false);setTurn(value=>value+direction);}
 function pointerDown(event:PointerEvent<HTMLDivElement>){if((event.target as Element).closest('button,a,.ag-pass-reading'))return;drag.current={x:event.clientX,y:event.clientY,id:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);}
 function pointerUp(event:PointerEvent<HTMLDivElement>){if(!drag.current||event.pointerId!==drag.current.id)return;const distance=event.clientX-drag.current.x,vertical=event.clientY-drag.current.y;drag.current=null;setDragging(false);if(Math.abs(distance)>35&&Math.abs(distance)>Math.abs(vertical)*1.2)step(distance<0?1:-1);}
 function toggleMotion(){if(!playing){setFocused(false);setHovered(false);}setPlaying(value=>!value);}
 return <section className="site-section site-experts" id="experts" aria-labelledby="experts-heading" onFocusCapture={event=>setFocused(event.target.matches(':focus-visible'))} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false);}}>
  <div className="site-experts-heading"><div className="site-section-head"><h2 id="experts-heading">{t('让合适的专家，为你协作。','Bring the right experts together.')}</h2><p>{t('研究、设计、写作，或下一项值得认真对待的计划。选择专业能力，明确分工，让一个目标拥有不止一种视角。','Research, design, writing, or your next important plan. Choose the expertise you need and give every part of the work a clear role.')}</p></div><button className="site-experts-link" onClick={event=>openProductRoute('agents',event.currentTarget)}>{t('探索全部专家','Explore all experts')}</button></div>
  <div ref={stage} className="site-experts-orbit" data-dragging={dragging} data-autoplay={playing&&!reduced} role="region" aria-roledescription={t('轮播','carousel')} aria-label={t('专家工牌环形展台','Expert badge carousel')} tabIndex={0} onPointerMove={event=>{if(event.pointerType==='mouse')setHovered(true);}} onPointerLeave={()=>setHovered(false)} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}if(event.key==='ArrowRight'){event.preventDefault();step(1);}if(event.key==='Home'){event.preventDefault();choose(0);}if(event.key==='End'){event.preventDefault();choose(templates.length-1);}}} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={()=>{drag.current=null;setDragging(false);}}>
   <div className="site-experts-orbit-ground" aria-hidden="true"/>
   {templates.map((item,index)=>{
    const angle=(index-turn)*Math.PI*2/templates.length,depth=(1+Math.cos(angle))/2,selected=current===index;
    const agent:AgentProfile={id:`expert-${item.id}`,name:expertText(item.name,language),role:expertText(item.role,language),instructions:expertText(item.instructions,language),avatarStyle:'pixelArt',createdAt:'2026-09-30'};
    const style={'--orbit-x':Math.sin(angle),'--orbit-y':(1-depth)*-220,'--orbit-scale':.53+depth*.47,'--orbit-tilt':Math.sin(angle)*-13,'--orbit-opacity':.3+depth*.7,zIndex:Math.round(depth*100)} as CSSProperties;
    return <div key={agent.id} className={`site-expert-orbit-card${selected?' is-current':''}`} style={style} role="group" aria-roledescription={t('工牌','slide')} aria-label={`${index+1} / ${templates.length}: ${agent.name}`}>
     <div inert={!selected}><ScaledAgentBadge agent={agent} face={faces[agent.id]||'identity'} onFaceChange={face=>{setPlaying(false);setFaces(current=>({...current,[agent.id]:face}));}}/></div>
     {!selected&&<button className="site-expert-select" tabIndex={-1} onClick={()=>choose(index)} aria-label={t(`查看${agent.name}`,`View ${agent.name}`)}/>}
    </div>;
   })}
  </div>
  <div className="site-experts-orbit-footer"><div className="site-expert-caption" aria-live={playing&&!hovered&&!focused?'off':'polite'}><h3>{expertText(template.name,language)}</h3><p>{expertText(template.description,language)}</p></div><div className="site-experts-controls"><button type="button" onClick={()=>step(-1)} aria-label={t('上一位专家','Previous expert')}><ArrowLeft/></button><span className="site-experts-count">{String(current+1).padStart(2,'0')} <span>/ {String(templates.length).padStart(2,'0')}</span></span><button type="button" onClick={()=>step(1)} aria-label={t('下一位专家','Next expert')}><ArrowRight/></button>{!reduced&&<button className="site-experts-motion" type="button" onClick={toggleMotion} aria-label={playing?t('暂停工牌轮播','Pause badge rotation'):t('播放工牌轮播','Play badge rotation')} aria-pressed={playing}>{playing?<Pause/>:<Play/>}</button>}</div></div>
  <div className="site-experts-picker" role="group" aria-label={t('选择专家','Choose an expert')}>{templates.map((item,index)=><button key={item.id} type="button" aria-pressed={index===current} onClick={()=>choose(index)}>{expertText(item.name,language)}</button>)}</div>
  <div className={`site-experts-workspace${expertScreen?'':' without-screen'}`}><div><h3>{t('从一张工牌，走进一支团队。','From an expert card to a working team.')}</h3><p>{t('为专家配置模型、知识和工具。围绕任务组建团队，由负责人拆解工作，再回到同一个空间查看讨论与成果。','Configure each expert’s model, knowledge and tools. Build a team around a task, give a lead responsibility for coordination, and keep the discussion and results together.')}</p><button className="site-experts-link" onClick={event=>openProductRoute('agents',event.currentTarget)}>{t('进入专家工作区','Open the expert workspace')}</button></div>{expertScreen&&<ProductPreview kind="specialists" route="agents" alt={t('SecondU 中文专家工作区，展示真实专家和协作入口','SecondU English expert workspace, showing real specialists and collaboration controls')} action={t('进入专家工作区','Open the expert workspace')} className="site-experts-screen"/>}</div>
 </section>;
}
