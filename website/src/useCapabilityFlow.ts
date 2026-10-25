import {useEffect,useRef} from 'react';

const clamp=(value:number)=>Math.max(0,Math.min(1,value));

/** One native scroll timeline deals the existing cards; no duplicate gallery. */
export function useCapabilityFlow(){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  const cards=Array.from(element.querySelectorAll<HTMLElement>(':scope > .cap-story'));
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,visible=true,disposed=false,starts:number[]=[];
  const draw=()=>{
   frame=0;if(disposed||!visible)return;
   const top=element.getBoundingClientRect().top,vh=innerHeight,sticky=innerWidth<=720?68:88;
   cards.forEach((card,index)=>{
    const entry=motion.matches?1:clamp((vh*.96-(top+starts[index]))/(vh*.68));
    const covered=motion.matches||index===cards.length-1?0:clamp((sticky+vh*.4-(top+starts[index+1]))/(vh*.4));
    card.style.setProperty('--flow-lift',`${(1-entry)*90-covered*16}px`);
    card.style.setProperty('--flow-tilt',`${(1-entry)*11}deg`);
    card.style.setProperty('--flow-fan',`${(1-entry)*(index%2?1.8:-1.8)}deg`);
    card.style.setProperty('--flow-scale',String(.92+entry*.08-covered*.055));
    card.style.setProperty('--flow-shadow',String(covered*.08+(1-entry)*.045));
    card.style.zIndex=String(index+1);
   });
  };
  const schedule=()=>{if(!frame&&visible)frame=requestAnimationFrame(draw);};
  const measure=()=>{
   element.dataset.flow='measure';
   starts=cards.map(card=>card.offsetTop);
   cards.forEach(card=>{card.dataset.flowFits=String(card.offsetHeight<=innerHeight-82);});
   element.dataset.flow=motion.matches?'static':'dealing';draw();
  };
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)schedule();},{rootMargin:'100px'});observer.observe(element);
  const resize=new ResizeObserver(measure);resize.observe(element);
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',measure);motion.addEventListener('change',measure);
  void document.fonts.ready.then(()=>{if(!disposed)measure();});measure();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();removeEventListener('scroll',schedule);removeEventListener('resize',measure);motion.removeEventListener('change',measure);};
 },[]);
 return host;
}
