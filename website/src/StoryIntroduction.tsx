import {useEffect,useRef,type CSSProperties} from 'react';
import {useSiteLanguage} from './site-language';
import {activityPaletteOptions} from '../../shared/appearance-options.mjs';

/** Reading follows native page movement; no wheel capture or pinned empty screens. */
export default function StoryIntroduction(){
 const {language,t}=useSiteLanguage();
 const host=useRef<HTMLDivElement>(null);
 const sentence=t('把你走过的路，变成下一步的底气。一个懂你的分身，陪你想清楚，也一起做出来。','Turn what you’ve lived into what comes next. A twin that knows you, thinks it through with you, and helps you make it happen.');
 const colors=activityPaletteOptions.find(option=>option.id==='spectrum')!.stops!;
 const tone=(index:number)=>{const position=index/Math.max(1,parts.length-1)*(colors.length-1),from=Math.min(colors.length-2,Math.floor(position));return `color-mix(in srgb,${colors[from].color},${colors[from+1].color} ${(position-from)*100}%)`;};
 const parts=language==='zh'?Array.from(sentence):sentence.split(/(\s+)/);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  const query=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0;
  const draw=()=>{frame=0;const rect=element.querySelector('h2')!.getBoundingClientRect();const progress=query.matches?1.15:Math.max(0,Math.min(1.15,(innerHeight*.72-rect.top)/(innerHeight*.34)));element.style.setProperty('--reading-progress',String(progress));};
  const update=()=>{if(!frame)frame=requestAnimationFrame(draw);};
  const resize=new ResizeObserver(update);resize.observe(element);
  addEventListener('scroll',update,{passive:true});addEventListener('resize',update);query.addEventListener('change',update);draw();
  return()=>{cancelAnimationFrame(frame);resize.disconnect();removeEventListener('scroll',update);removeEventListener('resize',update);query.removeEventListener('change',update);};
 },[language]);
 return <div ref={host} className="site-story-introduction"><h2 aria-label={sentence}>{parts.map((part,index)=><span aria-hidden="true" key={index} style={{'--word-start':index/parts.length,'--reading-color':tone(index)} as CSSProperties}>{part}</span>)}</h2></div>;
}
