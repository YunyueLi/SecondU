import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject,type ReactNode,type CSSProperties} from 'react';
import {createFilmTiming,filmFrameAt,filmIsComplete,type FilmTiming} from './filmTiming';

type FilmClock={duration:number;timing:FilmTiming;elapsed:number;reduced:boolean;completed:boolean;animations:Set<Animation>;writers:Set<(time:number)=>void>;stage?:Element;stillAt?:number};
const MotionClock=createContext<FilmClock|null>(null);
function previewFrame(duration:number){
 if(!import.meta.env.DEV||location.pathname!=='/guide-preview.html')return undefined;
 const value=new URLSearchParams(location.search).get('at');
 return value?.trim()&&Number.isFinite(Number(value))?Math.max(0,Math.min(duration-1,Number(value))):undefined;
}
function frameTime(clock:FilmClock){return filmFrameAt(clock.timing,clock.elapsed,clock.reduced,clock.stillAt);}
// Only changes that replace content enter React. Motion and typing never repaint the scene tree.
const edits=[0,2800,3300,3500,3800,4800,5000,6500,8300,9400,9600,11400,12300,12900,13000,13300,13900,14400,14600,15900,18000,19700,20100,21400,22400,24000];
export function useFilmDriver(duration:number,onComplete:()=>void,introUntil=0){
 const stillAt=previewFrame(duration);
 const clock=useMemo<FilmClock>(()=>({duration,timing:createFilmTiming(duration,introUntil),elapsed:0,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced',completed:false,animations:new Set(),writers:new Set(),stillAt}),[duration,introUntil,stillAt]);
 const complete=useRef(onComplete);complete.current=onComplete;
 const [time,setTime]=useState(()=>frameTime(clock));
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let frame:number|undefined,last=performance.now(),bucket=-1,cycle=-1,disposed=false,visible=!document.hidden;
  const pausedAmbient=new Set<Animation>();
  const advance=(now:number)=>{if(clock.stillAt===undefined&&visible&&!clock.reduced)clock.elapsed+=Math.max(0,now-last);last=now;};
  const finish=()=>{if(!clock.completed&&filmIsComplete(clock.timing,clock.elapsed,clock.reduced,clock.stillAt)){clock.completed=true;complete.current();}};
  const paint=()=>{
   const at=frameTime(clock);
   // Native motion, typing, pointer targets and scene changes share one exact time.
   for(const animation of clock.animations)animation.currentTime=at;
   for(const writer of clock.writers)writer(at);
   const next=edits.filter(value=>value<at).length,round=Math.floor(clock.elapsed/clock.timing.playbackDuration);
   if(next!==bucket||round!==cycle){bucket=next;cycle=round;setTime(clock.stillAt??(clock.reduced?at:(edits[Math.max(0,next-1)]||0)+1));}
  };
  const stopSchedule=()=>{if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;};
  const resumeAmbient=()=>{for(const animation of pausedAmbient)if(animation.playState==='paused')animation.play();pausedAmbient.clear();};
  const syncAnimations=()=>{
   for(const animation of clock.animations)animation.currentTime=frameTime(clock);
   if(!visible||clock.reduced||clock.stillAt!==undefined){for(const animation of clock.stage?.getAnimations({subtree:true})||[])if(!clock.animations.has(animation)&&(animation.playState==='running'||animation.pending)){if(clock.stillAt!==undefined)animation.currentTime=clock.stillAt;animation.pause();pausedAmbient.add(animation);}}
   else resumeAmbient();
  };
  const schedule=()=>{
   if(disposed||!visible||clock.reduced||clock.stillAt!==undefined)return;
   frame=requestAnimationFrame(animate);
  };
  const animate=(now:number)=>{frame=undefined;if(disposed||!visible||document.hidden)return;advance(now);paint();finish();schedule();};
  const synchronize=()=>{stopSchedule();advance(performance.now());visible=!document.hidden;clock.reduced=media.matches||document.documentElement.dataset.motion==='reduced';syncAnimations();if(visible)paint();finish();schedule();};
  const appearanceObserver=new MutationObserver(synchronize);appearanceObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});document.addEventListener('visibilitychange',synchronize);media.addEventListener('change',synchronize);synchronize();
  return()=>{disposed=true;stopSchedule();appearanceObserver.disconnect();document.removeEventListener('visibilitychange',synchronize);media.removeEventListener('change',synchronize);resumeAmbient();for(const animation of clock.animations)animation.cancel();clock.animations.clear();clock.writers.clear();};
 },[clock,duration]);
 return {clock,time};
}
export function FilmMotionProvider({clock,children}:{clock:FilmClock;children:ReactNode}){return <MotionClock.Provider value={clock}>{children}</MotionClock.Provider>;}
function useClock(){const clock=useContext(MotionClock);if(!clock)throw new Error('Film motion requires its own clock');return clock;}
function register(clock:FilmClock,element:Element,keyframes:Keyframe[],easing='linear'){
 const animation=element.animate(keyframes,{duration:clock.duration,iterations:Infinity,fill:'both',easing});animation.pause();clock.animations.add(animation);animation.currentTime=frameTime(clock);return()=>{animation.cancel();clock.animations.delete(animation);};
}
export function rangeFrames(duration:number,at:number,length:number,from:Keyframe,to:Keyframe):Keyframe[]{return [{...from,offset:0},{...from,offset:at/duration,easing:'cubic-bezier(.2,.7,.2,1)'},{...to,offset:Math.min(1,(at+length)/duration)},{...to,offset:1}];}
export function MotionAppear({at,until,children,className='',style={}}:{at:number;until?:number;children:ReactNode;className?:string;style?:CSSProperties}){const clock=useClock(),ref=useRef<HTMLDivElement>(null);useLayoutEffect(()=>{if(!ref.current)return;const frames=rangeFrames(clock.duration,at,450,{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0px)'});if(until!==undefined){frames.pop();frames.push({offset:until/clock.duration,opacity:1,transform:'translateY(0px)',easing:'ease-out'},{offset:Math.min(1,(until+450)/clock.duration),opacity:0,transform:'translateY(-8px)'},{offset:1,opacity:0,transform:'translateY(-8px)'});}return register(clock,ref.current,frames);},[clock]);return <div ref={ref} className={className} style={style}>{children}</div>;}
export function MotionWrite({value,at,ms=1600}:{value:string;at:number;ms?:number}){const clock=useClock(),ref=useRef<HTMLSpanElement>(null);useLayoutEffect(()=>{let previous=-1;const update=(time:number)=>{const length=Math.max(0,Math.min(value.length,Math.floor(value.length*(time-at)/ms)));if(length!==previous&&ref.current){previous=length;ref.current.textContent=value.slice(0,length);}};clock.writers.add(update);update(frameTime(clock));return()=>{clock.writers.delete(update);};},[clock,value,at,ms]);return <span ref={ref}/>;}
export type FilmPointerStep = {at:number;target:string;click?:boolean;anchor?:[number,number]} | {at:number;position:[number,number];click?:never};
/** Resolve the demonstrated control from the live layout, including responsive and animated transforms. */
export function MotionPointer({steps}:{steps:FilmPointerStep[]}){
 const clock=useClock(),ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const pointer=ref.current,stage=pointer?.parentElement,ring=pointer?.querySelector('i');
  if(!pointer||!stage||!ring)return;
  const cached=new Map<FilmPointerStep,{x:number;y:number}>();
  const resolve=(step:FilmPointerStep,stageBox:DOMRect)=>{
   const ratioX=stage.clientWidth/stageBox.width,ratioY=stage.clientHeight/stageBox.height;
   if('position' in step)return {x:stage.clientWidth*step.position[0]/100,y:stage.clientHeight*step.position[1]/100,found:true};
   const target=stage.querySelector(step.target),box=target?.getBoundingClientRect();
   if(box&&box.width&&box.height){const anchor=step.anchor||[.5,.5],point={x:(box.left-stageBox.left+box.width*anchor[0])*ratioX,y:(box.top-stageBox.top+box.height*anchor[1])*ratioY};cached.set(step,point);return {...point,found:true};}
   return {...(cached.get(step)||{x:0,y:0}),found:false};
  };
  const update=(time:number)=>{
   const stageBox=stage.getBoundingClientRect();
   let index=0;while(index+1<steps.length&&steps[index+1].at<=time)index++;
   const previous=steps[index],next=steps[index+1],start=resolve(previous,stageBox);
   let x=start.x,y=start.y;
   if(next){const moveAt=Math.max(previous.at,next.at-270),fraction=Math.max(0,Math.min(1,(time-moveAt)/(next.at-moveAt))),eased=fraction*fraction*(3-2*fraction),end=resolve(next,stageBox);x+=(end.x-x)*eased;y+=(end.y-y)*eased;}
   // The SVG path begins at (4, 2); CSS puts that exact tip at this measured point.
   pointer.style.transform=`translate3d(${x}px,${y}px,0)`;
   pointer.style.opacity=time<600||clock.reduced?'0':'1';
   const click=previous.click&&'target' in previous&&time<previous.at+260&&start.found?previous:undefined;
   const pulse=click?(time-click.at)/260:0;
   ring.style.opacity=click?String(.8*(1-pulse)):'0';
   ring.style.transform=`scale(${.5+pulse*.75})`;
   pointer.dataset.filmTime=String(Math.round(time));
   pointer.dataset.filmTarget='target' in previous?previous.target:'';
   pointer.dataset.filmClick=click&&'target' in click?click.target:'';
   pointer.dataset.filmClickAt=click?String(click.at):'';
  };
  clock.writers.add(update);update(frameTime(clock));
  return()=>{clock.writers.delete(update);};
 },[clock,steps]);
 return <div ref={ref} className="film-pointer" aria-hidden="true"><svg viewBox="0 0 24 28"><path d="M4 2 21 17l-9 .8-4.5 7.3z" fill="#34352f" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round"/></svg><i/></div>;
}
export type FilmMove={selector:string;at:number;duration?:number;from:Keyframe;to:Keyframe};
export function NativeFilmMotion({stage,moves}:{stage:RefObject<HTMLDivElement|null>;moves:FilmMove[]}){const clock=useClock();useLayoutEffect(()=>{const node=stage.current;if(!node)return;clock.stage=node;const stops=moves.flatMap(move=>[...node.querySelectorAll(move.selector)].map(element=>register(clock,element,rangeFrames(clock.duration,move.at,move.duration||650,move.from,move.to))));const fade=register(clock,node,[{offset:0,opacity:0},{offset:350/clock.duration,opacity:1},{offset:(clock.duration-550)/clock.duration,opacity:1},{offset:1,opacity:0}]);return()=>{stops.forEach(stop=>stop());fade();if(clock.stage===node)clock.stage=undefined;};},[clock]);return null;}
